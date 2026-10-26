"""
Baccarat Road Detector — finds the Big Road's cell lattice from its circles.

The Big Road draws hollow circles, while header badges, the bead plate and
the Small Road use filled ones, and the derived roads use smaller ones. So
the largest hollow red/blue circles give the Big Road: their spacing is the
cell pitch, and the top row of circles is the first row. Each cell on that
lattice is then classified by color.

Roads without hollow circles fall back to the previous approach: blur, isolate
the largest circles by diameter, and split the isolated height into 6 rows.

Tie handling: In standard baccarat Big Road, ties are shown as green
lines/numbers overlaid on the previous B/P circle, not as separate cells.
We detect green sub-regions within B/P cells to find ties.
"""

import base64
import cv2
import numpy as np
from typing import List, Optional, Tuple

# HSV color ranges
COLOR_RANGES = {
    "B": [  # Banker = Red
        (np.array([0, 50, 50]), np.array([18, 255, 255])),
        (np.array([155, 50, 50]), np.array([180, 255, 255])),
    ],
    "P": [  # Player = Blue
        (np.array([85, 50, 50]), np.array([140, 255, 255])),
    ],
    "T": [  # Tie = Green
        (np.array([35, 40, 40]), np.array([85, 255, 255])),
    ],
}

# Relaxed ranges for grid cell classification (after heavy blur)
COLOR_RANGES_RELAXED = {
    "B": [
        (np.array([0, 40, 40]), np.array([18, 255, 255])),
        (np.array([155, 40, 40]), np.array([180, 255, 255])),
    ],
    "P": [
        (np.array([85, 40, 40]), np.array([140, 255, 255])),
    ],
    "T": [
        (np.array([35, 40, 40]), np.array([85, 255, 255])),
    ],
}

BIG_ROAD_ROWS = 6
MIN_COLOR_RATIO = 0.08
MIN_TIE_RATIO = 0.02
# Minimum circularity (0-1) to consider a blob as a road circle
MIN_CIRCULARITY = 0.5
# Minimum blob area (pixels) to consider
MIN_BLOB_AREA = 10


def color_pixel_count(hsv: np.ndarray, color: str, relaxed: bool = False) -> int:
    """Count pixels matching a color in an HSV region."""
    ranges = COLOR_RANGES_RELAXED[color] if relaxed else COLOR_RANGES[color]
    total = 0
    for lower, upper in ranges:
        total += cv2.countNonZero(cv2.inRange(hsv, lower, upper))
    return total


def classify_cell(hsv_cell: np.ndarray) -> Tuple[Optional[str], bool]:
    """Classify a grid cell. Uses relaxed color ranges (for blurred images)."""
    area = hsv_cell.shape[0] * hsv_cell.shape[1]
    if area == 0:
        return None, False

    counts = {c: color_pixel_count(hsv_cell, c, relaxed=True) for c in ["B", "P", "T"]}

    bp_best = "B" if counts["B"] >= counts["P"] else "P"
    if counts[bp_best] < area * MIN_COLOR_RATIO:
        if counts["T"] >= area * MIN_COLOR_RATIO:
            return "T", False
        return None, False

    has_tie = counts["T"] >= area * MIN_TIE_RATIO
    return bp_best, has_tie


def classify_cell_unblurred(hsv_cell: np.ndarray) -> bool:
    """Check for green tie markers on the UNBLURRED image."""
    area = hsv_cell.shape[0] * hsv_cell.shape[1]
    if area == 0:
        return False
    green_count = color_pixel_count(hsv_cell, "T", relaxed=True)
    return green_count >= area * MIN_TIE_RATIO


def estimate_cell_size(img_h: int) -> int:
    """Big Road always has 6 rows. Cell size = image height / 6."""
    return max(8, img_h // BIG_ROAD_ROWS)


# ── Big Road Isolation via Circle Detection ──


def _find_circles(image: np.ndarray) -> List[dict]:
    """Find circular colored blobs (red/blue) in the image."""
    blurred = cv2.GaussianBlur(image, (3, 3), 0)
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)

    # Build color mask (red + blue only)
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for color in ["B", "P"]:
        for lower, upper in COLOR_RANGES[color]:
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, lower, upper))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    circles = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < MIN_BLOB_AREA:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        if circularity < MIN_CIRCULARITY:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        diameter = min(w, h)
        if diameter < 4:
            continue

        circles.append({
            "diameter": diameter,
            "x": x, "y": y, "w": w, "h": h,
            "cx": x + w // 2, "cy": y + h // 2,
        })

    return circles


def _cluster_by_diameter(circles: List[dict]) -> List[List[dict]]:
    """Cluster circles into groups by similar diameter.

    Uses a simple approach: sort by diameter, split when gap > 30% of current.
    """
    if not circles:
        return []

    sorted_circles = sorted(circles, key=lambda c: c["diameter"])
    clusters = [[sorted_circles[0]]]

    for c in sorted_circles[1:]:
        prev_d = clusters[-1][-1]["diameter"]
        # If this circle's diameter is >30% larger than previous, new cluster
        if c["diameter"] > prev_d * 1.35:
            clusters.append([c])
        else:
            clusters[-1].append(c)

    return clusters


def isolate_big_road(image: np.ndarray) -> Tuple[np.ndarray, int, int]:
    """Isolate the Big Road region by finding circular blobs, clustering
    by diameter, and cropping to the bounding box of the largest-diameter
    cluster (Big Road has the biggest circles).

    Returns (cropped_image, x_offset, y_offset).
    """
    img_h, img_w = image.shape[:2]
    if img_h < 30 or img_w < 30:
        return image, 0, 0

    circles = _find_circles(image)
    if len(circles) < 3:
        return image, 0, 0

    clusters = _cluster_by_diameter(circles)
    if len(clusters) <= 1:
        # Only one size group — either it's all Big Road, or can't distinguish
        return image, 0, 0

    # The Big Road cluster is the one with the largest diameter circles
    big_road_cluster = clusters[-1]  # last cluster = largest diameters

    # Need at least a few circles to be confident
    if len(big_road_cluster) < 3:
        # Maybe the largest cluster is just a few outliers — try second largest
        if len(clusters) >= 2 and len(clusters[-2]) >= 5:
            big_road_cluster = clusters[-2]
        else:
            return image, 0, 0

    # Compute bounding box of the Big Road circles
    x_min = min(c["x"] for c in big_road_cluster)
    y_min = min(c["y"] for c in big_road_cluster)
    x_max = max(c["x"] + c["w"] for c in big_road_cluster)
    y_max = max(c["y"] + c["h"] for c in big_road_cluster)

    # Add margin (half a circle diameter)
    avg_d = sum(c["diameter"] for c in big_road_cluster) // len(big_road_cluster)
    margin = avg_d // 2

    x_min = max(0, x_min - margin)
    y_min = max(0, y_min - margin)
    x_max = min(img_w, x_max + margin)
    y_max = min(img_h, y_max + margin)

    crop_w = x_max - x_min
    crop_h = y_max - y_min

    # Only crop if we actually filtered out a meaningful portion
    if crop_w >= img_w * 0.95 and crop_h >= img_h * 0.95:
        return image, 0, 0

    return image[y_min:y_max, x_min:x_max], x_min, y_min


# ── Big Road lattice from hollow circles ──

# Bright red/blue only. Big Road circles are hollow, and some roads tint the
# inside with a dark shade of the same hue, which must not count as filled.
BRIGHT_RANGES = {
    "B": [
        (np.array([0, 100, 120]), np.array([18, 255, 255])),
        (np.array([155, 100, 120]), np.array([180, 255, 255])),
    ],
    "P": [
        (np.array([85, 100, 120]), np.array([140, 255, 255])),
    ],
}
# At most this share of a Big Road circle's centre has its color. Real circles
# measure up to 0.07 (a pair dot nearby); a badge with a white glyph, 0.33 and up.
MAX_RING_FILL = 0.15


def _color_mask(hsv: np.ndarray, ranges) -> np.ndarray:
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lower, upper in ranges:
        mask = cv2.bitwise_or(mask, cv2.inRange(hsv, lower, upper))
    return mask


def _centre_fill(mask: np.ndarray, cx: float, cy: float, diameter: float) -> float:
    """Share of the disc at the centre of a circle (half its diameter across) that has the color."""
    r = max(1, int(diameter / 4))
    x, y = int(round(cx)), int(round(cy))
    h, w = mask.shape[:2]
    x1, y1, x2, y2 = max(0, x - r), max(0, y - r), min(w, x + r + 1), min(h, y + r + 1)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    yy, xx = np.ogrid[y1:y2, x1:x2]
    disc = (xx - x) ** 2 + (yy - y) ** 2 <= r * r
    total = int(disc.sum())
    return float((mask[y1:y2, x1:x2] > 0)[disc].sum()) / total if total else 0.0


def _find_rings(hsv: np.ndarray) -> List[dict]:
    """Hollow red/blue circles. Header badges, bead plate discs and small road dots are filled."""
    rings = []
    for color, ranges in BRIGHT_RANGES.items():
        mask = _color_mask(hsv, ranges)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            diameter = min(w, h)
            if diameter < 6 or max(w, h) > 1.3 * diameter:
                continue
            perimeter = cv2.arcLength(cnt, True)
            if perimeter == 0 or 4 * np.pi * cv2.contourArea(cnt) / (perimeter * perimeter) < MIN_CIRCULARITY:
                continue
            cx, cy = x + (w - 1) / 2, y + (h - 1) / 2
            if _centre_fill(mask, cx, cy, diameter) > MAX_RING_FILL:
                continue
            rings.append({"color": color, "cx": cx, "cy": cy, "diameter": diameter})
    return rings


def _nearest_steps(rings: List[dict], along: str, diameter: float) -> List[float]:
    """Distance from each circle to the next one in the same row (x) or column (y)."""
    a, b = ("cx", "cy") if along == "x" else ("cy", "cx")
    steps = []
    for r in rings:
        ahead = [o[a] - r[a] for o in rings if o[a] > r[a] and abs(o[b] - r[b]) < 0.3 * diameter]
        # Neighbouring cells only; a longer step skips empty cells
        if ahead and diameter <= min(ahead) <= 2.2 * diameter:
            steps.append(min(ahead))
    return steps


# Circles fitted first, in pitches from the first one; a pitch off by up to 5% still gives them the right index
FIT_START_REACH = 8


def _fit_axis(values: List[float], pitch: float) -> Tuple[float, float]:
    """Fit centre = origin + index * pitch; index 0 is the first row or column with a circle.

    A pitch measured from whole-pixel circle bounds is off by a few percent,
    which adds up over a wide road until far circles get the wrong index. So the
    fit starts with the circles near the first one, and each refined pitch
    takes in circles twice as far.
    """
    vals = np.array(values, dtype=float)
    first = float(vals.min())
    origin, step, fitted = first, pitch, False
    reach = FIT_START_REACH
    while True:
        near = vals[vals - first <= (reach + 0.5) * step]
        idx = np.round((near - origin) / step)
        if len(np.unique(idx)) >= 2:
            slope, intercept = np.polyfit(idx, near, 1)
            if 0.85 * pitch <= slope <= 1.15 * pitch:
                origin, step, fitted = float(intercept), float(slope), True
        if len(near) == len(vals):
            break
        reach *= 2
    if fitted:
        return origin, step
    idx = np.round((vals - first) / pitch)
    return float(np.median(vals - idx * pitch)), pitch


def _find_big_road_lattice(hsv: np.ndarray) -> Optional[dict]:
    """Where the Big Road's cells are, from the spacing of its circles.

    The Big Road has the largest hollow circles; its first row is the top row
    with circles, since every streak starts there.
    """
    clusters = [c for c in _cluster_by_diameter(_find_rings(hsv)) if len(c) >= 3]
    if not clusters:
        return None
    big = clusters[-1]
    diameter = float(np.median([r["diameter"] for r in big]))

    steps_x = _nearest_steps(big, "x", diameter)
    steps_y = _nearest_steps(big, "y", diameter)
    if not steps_x and not steps_y:
        return None
    pitch_x = float(np.median(steps_x or steps_y))
    pitch_y = float(np.median(steps_y or steps_x))

    x0, px = _fit_axis([r["cx"] for r in big], pitch_x)
    y0, py = _fit_axis([r["cy"] for r in big], pitch_y)
    cols = max(round((r["cx"] - x0) / px) for r in big) + 1
    return {"x0": x0, "y0": y0, "px": px, "py": py, "cols": int(cols), "diameter": diameter}


def _read_lattice(hsv: np.ndarray, lattice: dict) -> dict:
    """Classify each Big Road cell on the lattice."""
    masks = {color: _color_mask(hsv, ranges) for color, ranges in BRIGHT_RANGES.items()}
    green = _color_mask(hsv, COLOR_RANGES_RELAXED["T"])
    ih, iw = hsv.shape[:2]
    x0, y0, px, py = lattice["x0"], lattice["y0"], lattice["px"], lattice["py"]

    def read(col: int, row: int) -> Optional[dict]:
        cx, cy = x0 + col * px, y0 + row * py
        x1, x2 = max(0, int(round(cx - px / 2))), min(iw, int(round(cx + px / 2)))
        y1, y2 = max(0, int(round(cy - py / 2))), min(ih, int(round(cy + py / 2)))
        if x2 - x1 < px / 2 or y2 - y1 < py / 2:
            return None  # mostly outside the image
        area = (x2 - x1) * (y2 - y1)
        counts = {color: cv2.countNonZero(mask[y1:y2, x1:x2]) for color, mask in masks.items()}
        color = max(counts, key=counts.get)
        if counts[color] < area * MIN_COLOR_RATIO:
            return None
        # The lattice centre can be a pixel off the drawn circle's, and a small
        # circle's hole is barely wider than the disc measured, so allow for that
        fill = min(_centre_fill(masks[color], cx + dx, cy + dy, lattice["diameter"])
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        if fill > MAX_RING_FILL:
            return None  # a filled shape is not a Big Road circle
        return {
            "result": color,
            "has_tie": cv2.countNonZero(green[y1:y2, x1:x2]) >= area * MIN_TIE_RATIO,
            "col": col,
            "row": row,
            "x": int(round(cx)),
            "y": int(round(cy)),
            "w": int(round(px)),
            "h": int(round(py)),
        }

    def read_column(col: int) -> List[dict]:
        return [cell for cell in (read(col, row) for row in range(BIG_ROAD_ROWS)) if cell]

    columns = {col: read_column(col) for col in range(lattice["cols"])}
    # A circle crossed by a tie mark or a pair dot can be missed as a circle,
    # so keep reading sideways while the next column still holds Big Road cells
    col = -1
    while cells := read_column(col):
        columns[col] = cells
        col -= 1
    col = lattice["cols"]
    while cells := read_column(col):
        columns[col] = cells
        col += 1

    first, last = min(columns), max(columns)
    cells = [dict(cell, col=cell["col"] - first) for k in sorted(columns) for cell in columns[k]]

    vx1 = max(0, int(round(x0 + (first - 0.5) * px)))
    vx2 = min(iw, int(round(x0 + (last + 0.5) * px)))
    vy1 = max(0, int(round(y0 - 0.5 * py)))
    vy2 = min(ih, int(round(y0 + (BIG_ROAD_ROWS - 0.5) * py)))
    return {
        "cells": cells,
        "grid_rows": BIG_ROAD_ROWS,
        "grid_cols": last - first + 1,
        "cell_size": int(round(px)),
        "isolated": True,
        "view": (vx1, vy1, vx2 - vx1, vy2 - vy1),
    }


# ── Core Grid Detection ──


def _crop_region(image: np.ndarray, region: Optional[Tuple[int, int, int, int]]) -> np.ndarray:
    if region:
        x, y, w, h = region
        ih, iw = image.shape[:2]
        x, y = max(0, min(x, iw)), max(0, min(y, ih))
        w, h = min(w, iw - x), min(h, ih - y)
        if w > 0 and h > 0:
            image = image[y:y+h, x:x+w]
    return image


def detect_grid(image: np.ndarray) -> dict:
    """Find the Big Road cells. Cell x/y are centres in the image."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lattice = _find_big_road_lattice(hsv)
    if lattice:
        return _read_lattice(hsv, lattice)
    return _detect_grid_by_height(image)


def _detect_grid_by_height(image: np.ndarray) -> dict:
    """Previous approach, for roads without hollow circles: the Big Road
    fills the isolated area's height with its 6 rows."""
    # ── Auto-isolate the Big Road ──
    image, iso_x, iso_y = isolate_big_road(image)

    img_h, img_w = image.shape[:2]

    # Heavy Gaussian blur — merges text/outlines into solid blobs
    blur_k = max(3, (img_h // BIG_ROAD_ROWS) // 3)
    blur_k = blur_k if blur_k % 2 == 1 else blur_k + 1
    blurred = cv2.GaussianBlur(image, (blur_k, blur_k), 0)

    hsv_blurred = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)
    hsv_raw = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    cell_size = estimate_cell_size(img_h)
    rows = max(1, img_h // cell_size)
    cols = max(1, img_w // cell_size)

    margin = cell_size // 5
    cells = []
    for col in range(cols):
        for row in range(rows):
            x1 = col * cell_size + margin
            y1 = row * cell_size + margin
            x2 = min((col + 1) * cell_size - margin, img_w)
            y2 = min((row + 1) * cell_size - margin, img_h)

            if x2 <= x1 or y2 <= y1:
                continue

            result, has_tie_blurred = classify_cell(hsv_blurred[y1:y2, x1:x2])

            if result in ("B", "P") and not has_tie_blurred:
                has_tie_blurred = classify_cell_unblurred(hsv_raw[y1:y2, x1:x2])

            if result:
                cells.append({
                    "result": result,
                    "has_tie": has_tie_blurred if result in ("B", "P") else False,
                    "col": col,
                    "row": row,
                    "x": iso_x + col * cell_size + cell_size // 2,
                    "y": iso_y + row * cell_size + cell_size // 2,
                    "w": cell_size,
                    "h": cell_size,
                })

    return {
        "cells": cells,
        "grid_rows": rows,
        "grid_cols": cols,
        "cell_size": cell_size,
        "isolated": iso_x > 0 or iso_y > 0,
        "view": (iso_x, iso_y, cols * cell_size, rows * cell_size),
    }


def reading_order(cells: List[dict]) -> List[dict]:
    """The cells in the order their hands were played.

    Follows the Big Road layout rules, so a dragon tail that turned right is
    read as part of its own streak, and the tail of a streak that scrolled off
    on the left is left out. Falls back to column-by-column reading when the
    cells don't fit those rules.
    """
    if not cells:
        return []
    ordered = _big_road_order(cells)
    if ordered is None:
        ordered = sorted(cells, key=lambda c: (c["col"], c["row"]))
    return ordered


def grid_to_sequence(cells: List[dict]) -> List[str]:
    """Read the Big Road back into hands (see reading_order)."""
    return _hands(reading_order(cells))


def _hands(ordered: List[dict]) -> List[str]:
    """The hands of cells in reading order, a tie after the cell it marks."""
    sequence = []
    for c in ordered:
        sequence.append(c["result"])
        if c.get("has_tie"):
            sequence.append("T")
    return sequence


# Real roads resolve in a few hundred steps; this only stops pathological grids
MAX_RECONSTRUCT_STEPS = 20000


def _big_road_order(cells: List[dict]) -> Optional[List[dict]]:
    """Cells in the order the Big Road placed them, or None if they don't form one.

    Layout rules (same as src/roads/layout.ts): each streak starts at the top of
    the column after the previous streak's first column and goes down; at the
    bottom row, or above a cell an earlier streak already took, it turns right
    and continues along that row.

    Given where a streak starts, its path is fixed; only its length is open.
    Different lengths can draw the same road (an earlier dragon's tail may also
    read as the bottom cell of a later column of the same color), so the
    earlier streak is read as long as possible.

    Cells on the left edge may be the tails of streaks that started off screen
    (see _offscreen_tails); those are left out. The road is first read with
    none of them, then with as few as possible.
    """
    # A cell with only a tie mark has no place in the layout rules
    if any(c["result"] not in ("B", "P") for c in cells):
        return None

    grid = {(c["col"], c["row"]): c for c in cells}
    by_col: dict = {}
    for pos in grid:
        by_col.setdefault(pos[0], []).append(pos)
    steps = 0

    def solve(start_col: int, taken: frozenset, prev_color: Optional[str]):
        nonlocal steps
        if len(taken) == len(grid):
            return []
        steps += 1
        if steps > MAX_RECONSTRUCT_STEPS:
            return None

        col = start_col
        while (col, 0) in taken:
            col += 1
        first = grid.get((col, 0))
        if first is None or first["result"] == prev_color:
            return None

        # Follow the only path this streak can take
        color = first["result"]
        path = [(col, 0)]
        placed = set(taken) | {(col, 0)}
        c, r, turned = col, 0, False
        while True:
            if not turned and r + 1 < BIG_ROAD_ROWS and (c, r + 1) not in placed:
                nc, nr = c, r + 1
            else:
                turned = True
                nc, nr = c + 1, r
                while (nc, nr) in placed:
                    nc += 1
            nxt = grid.get((nc, nr))
            if nxt is None or nxt["result"] != color:
                break
            path.append((nc, nr))
            placed.add((nc, nr))
            c, r = nc, nr

        for length in range(len(path), 0, -1):
            chosen = taken | frozenset(path[:length])
            # Later streaks start further right and never move left, so every
            # cell up to this streak's start column must be read by now
            if any(pos not in chosen for k in range(start_col, col + 1) for pos in by_col.get(k, ())):
                continue
            rest = solve(col + 1, chosen, color)
            if rest is not None:
                return [path[:length]] + rest
        return None

    for offscreen in _offscreen_tails(grid):
        if offscreen and len(offscreen) == len(grid):
            continue  # only tails: no streak starts on screen
        streaks = solve(0, offscreen, None)
        if streaks is not None:
            return [grid[pos] for streak in streaks for pos in streak]
        if steps > MAX_RECONSTRUCT_STEPS:
            break
    return None


def _offscreen_tails(grid: dict):
    """Ways to read cells on the left edge as the tails of streaks that
    started off screen, fewest cells first.

    Once a scrolling road pushes a dragon's first column out of view, the tail
    it turned along stays on screen: a run of one color along a row, starting
    at column 0. Each row holds at most one such tail.
    """
    runs = []
    for row in range(BIG_ROAD_ROWS):
        run = []
        color = grid[(0, row)]["result"] if (0, row) in grid else None
        while color and (len(run), row) in grid and grid[(len(run), row)]["result"] == color:
            run.append((len(run), row))
        runs.append(run)

    def pick(rows: List[list], count: int):
        # Every way to take `count` cells from the starts of these runs
        if not rows:
            yield ()
            return
        for n in range(min(count, len(rows[0])) + 1):
            if count - n <= sum(len(run) for run in rows[1:]):
                for rest in pick(rows[1:], count - n):
                    yield tuple(rows[0][:n]) + rest

    for count in range(sum(len(run) for run in runs) + 1):
        for chosen in pick(runs, count):
            yield frozenset(chosen)


def generate_debug_image(image: np.ndarray, cells: List[dict], view: Tuple[int, int, int, int]) -> str:
    """Draw the detected cells on the Big Road area and return it as a base64 PNG data URL."""
    vx, vy, vw, vh = view
    vis = image[vy:vy + vh, vx:vx + vw].copy()
    color_map = {"B": (0, 0, 255), "P": (255, 0, 0), "T": (0, 180, 0)}

    for c in cells:
        x1 = c["x"] - c["w"] // 2 - vx
        y1 = c["y"] - c["h"] // 2 - vy
        clr = color_map.get(c["result"], (128, 128, 128))
        cv2.rectangle(vis, (x1, y1), (x1 + c["w"], y1 + c["h"]), clr, 2)
        label = c["result"]
        if c.get("has_tie"):
            label += "+T"
        cv2.putText(vis, label, (x1 + 4, y1 + c["h"] - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, clr, 1)

    _, buf = cv2.imencode(".png", vis)
    b64 = base64.b64encode(buf).decode("ascii")
    return f"data:image/png;base64,{b64}"


def analyze_image(
    image_bytes: bytes,
    region: Optional[Tuple[int, int, int, int]] = None,
) -> dict:
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        return {"error": "Failed to decode image", "cells": [], "sequence": []}

    road_image = _crop_region(image, region)
    grid = detect_grid(road_image)
    ordered = reading_order(grid["cells"])
    sequence = _hands(ordered)
    # Each cell's place in the reading, so the extension can order the hands it adds;
    # tails of streaks that started off screen are not read and have none
    place = {id(c): i for i, c in enumerate(ordered)}
    cells = [dict(c, order=place.get(id(c))) for c in grid["cells"]]

    # Debug image of the detected Big Road area
    debug_img = generate_debug_image(road_image, cells, grid["view"])

    return {
        "cells": cells,
        "sequence": sequence,
        "total": len(sequence),
        "banker_count": sequence.count("B"),
        "player_count": sequence.count("P"),
        "tie_count": sequence.count("T"),
        "image_size": {"w": image.shape[1], "h": image.shape[0]},
        "grid_info": {
            "cell_size": grid["cell_size"],
            "rows": grid["grid_rows"],
            "cols": grid["grid_cols"],
            "isolated": grid["isolated"],
        },
        "debug_image": debug_img,
    }
