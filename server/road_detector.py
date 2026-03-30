"""
Baccarat Road Detector — Blur + Grid approach with automatic Big Road isolation.

Key insight: heavily blur the image FIRST so text characters (莊/閒/和),
outlines, and solid circles all become uniform color blobs.
Then classify each grid cell by dominant color.

When the screenshot contains multiple road types (Big Road, Bead Plate,
Big Eye Boy, Small Road, Cockroach Pig), the detector automatically
segments them by finding horizontal gaps and identifies the Big Road
as the tallest segment with the largest circles.

Tie handling: In standard baccarat Big Road, ties are shown as green
lines/numbers overlaid on the previous B/P circle, not as separate cells.
We detect green sub-regions within B/P cells to find ties.
"""

import base64
import cv2
import numpy as np
from typing import List, Optional, Tuple

# HSV color ranges (relaxed to handle blur bleeding)
COLOR_RANGES = {
    "B": [  # Banker = Red
        (np.array([0, 40, 40]), np.array([18, 255, 255])),
        (np.array([155, 40, 40]), np.array([180, 255, 255])),
    ],
    "P": [  # Player = Blue
        (np.array([85, 40, 40]), np.array([140, 255, 255])),
    ],
    "T": [  # Tie = Green
        (np.array([35, 40, 40]), np.array([85, 255, 255])),
    ],
}

BIG_ROAD_ROWS = 6
# After blur, colored cells will have ~15-40% of pixels in color range.
# Empty cells (white/gray background) will have <5%.
MIN_COLOR_RATIO = 0.08
# Green tie markers are small — even 2% of the cell area is significant
MIN_TIE_RATIO = 0.02
# Minimum gap (in pixels) between road segments to consider them separate
MIN_SEGMENT_GAP = 4
# Minimum fraction of colored pixels in a row to consider it non-empty
ROW_COLOR_THRESHOLD = 0.005


def color_pixel_count(hsv: np.ndarray, color: str) -> int:
    """Count pixels matching a color in an HSV region."""
    total = 0
    for lower, upper in COLOR_RANGES[color]:
        total += cv2.countNonZero(cv2.inRange(hsv, lower, upper))
    return total


def classify_cell(hsv_cell: np.ndarray) -> Tuple[Optional[str], bool]:
    """Classify a grid cell.

    Returns (outcome, has_tie):
      - outcome: 'B', 'P', or None (empty)
      - has_tie: True if green tie marker detected on this cell
    """
    area = hsv_cell.shape[0] * hsv_cell.shape[1]
    if area == 0:
        return None, False

    counts = {c: color_pixel_count(hsv_cell, c) for c in ["B", "P", "T"]}

    # Check for B or P as the primary color
    bp_best = "B" if counts["B"] >= counts["P"] else "P"
    if counts[bp_best] < area * MIN_COLOR_RATIO:
        # Not a B/P cell — could it be a standalone green (tie) cell?
        # In most UIs ties overlay on B/P, so standalone green is rare
        if counts["T"] >= area * MIN_COLOR_RATIO:
            return "T", False
        return None, False

    # It's a B/P cell — check if there's also a green tie marker
    has_tie = counts["T"] >= area * MIN_TIE_RATIO
    return bp_best, has_tie


def classify_cell_unblurred(hsv_cell: np.ndarray) -> bool:
    """Check for green tie markers on the UNBLURRED image (more sensitive)."""
    area = hsv_cell.shape[0] * hsv_cell.shape[1]
    if area == 0:
        return False
    green_count = color_pixel_count(hsv_cell, "T")
    return green_count >= area * MIN_TIE_RATIO


def estimate_cell_size(img_h: int) -> int:
    """Big Road always has 6 rows. Cell size = image height / 6."""
    return max(8, img_h // BIG_ROAD_ROWS)


# ── Road Segment Isolation ──


def _row_has_color(hsv_row: np.ndarray) -> bool:
    """Check if a horizontal row of pixels has meaningful colored content."""
    area = hsv_row.shape[0] * hsv_row.shape[1]
    if area == 0:
        return False
    total = 0
    for color in ["B", "P", "T"]:
        total += color_pixel_count(hsv_row, color)
    return total >= area * ROW_COLOR_THRESHOLD


def find_road_segments(image: np.ndarray) -> List[Tuple[int, int]]:
    """Find vertically separated road segments by scanning for horizontal gaps.

    Returns list of (y_start, y_end) tuples for each segment.
    A gap is a consecutive run of rows with no colored pixels.
    """
    img_h, img_w = image.shape[:2]
    if img_h < 20:
        return [(0, img_h)]

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Scan each row
    row_active = []
    for y in range(img_h):
        row_active.append(_row_has_color(hsv[y:y+1, :]))

    # Find contiguous active segments
    segments = []
    in_segment = False
    seg_start = 0

    for y, active in enumerate(row_active):
        if active and not in_segment:
            seg_start = y
            in_segment = True
        elif not active and in_segment:
            # Check if this gap is wide enough to be a real separator
            gap_end = y
            while gap_end < img_h and not row_active[gap_end]:
                gap_end += 1
            gap_size = gap_end - y
            if gap_size >= MIN_SEGMENT_GAP:
                segments.append((seg_start, y))
                in_segment = False

    if in_segment:
        segments.append((seg_start, img_h))

    # Filter out very thin segments (likely text labels, stats bars, etc.)
    # A valid road segment should be at least 30px tall
    segments = [(s, e) for s, e in segments if (e - s) >= 30]

    if not segments:
        return [(0, img_h)]

    return segments


def pick_big_road_segment(
    image: np.ndarray,
    segments: List[Tuple[int, int]],
) -> Tuple[int, int]:
    """Pick the segment most likely to be the Big Road.

    Heuristics:
    1. Big Road has the tallest cells (largest circles) among all roads.
       It's typically the tallest segment or near the top.
    2. Big Road uses standard 6-row layout, so its height should be
       divisible-ish by 6 with a reasonable cell size.
    3. It should contain both red and blue colored cells.
    """
    if len(segments) == 1:
        return segments[0]

    best = segments[0]
    best_score = -1

    for seg_start, seg_end in segments:
        seg_h = seg_end - seg_start
        seg_img = image[seg_start:seg_end, :]

        # Score 1: Height — Big Road is usually the tallest segment
        height_score = seg_h

        # Score 2: Has both red and blue — a road should have B and P cells
        hsv = cv2.cvtColor(seg_img, cv2.COLOR_BGR2HSV)
        area = seg_img.shape[0] * seg_img.shape[1]
        b_count = color_pixel_count(hsv, "B")
        p_count = color_pixel_count(hsv, "P")
        has_both = 1.0 if (b_count > area * 0.005 and p_count > area * 0.005) else 0.3

        # Score 3: Cell size reasonableness — Big Road cells are bigger than derived roads
        estimated_cell = seg_h / BIG_ROAD_ROWS
        # Big Road cells are typically 15-80px; derived roads use smaller cells
        cell_score = 1.0 if estimated_cell >= 12 else 0.3

        score = height_score * has_both * cell_score
        if score > best_score:
            best_score = score
            best = (seg_start, seg_end)

    return best


# ── Core Grid Detection ──


def detect_grid(
    image: np.ndarray,
    region: Optional[Tuple[int, int, int, int]] = None,
) -> dict:
    if region:
        x, y, w, h = region
        ih, iw = image.shape[:2]
        x, y = max(0, min(x, iw)), max(0, min(y, ih))
        w, h = min(w, iw - x), min(h, ih - y)
        if w > 0 and h > 0:
            image = image[y:y+h, x:x+w]

    # ── Auto-segment: find and isolate the Big Road ──
    segments = find_road_segments(image)
    seg_y_offset = 0
    if len(segments) > 1:
        seg_start, seg_end = pick_big_road_segment(image, segments)
        seg_y_offset = seg_start
        image = image[seg_start:seg_end, :]

    img_h, img_w = image.shape[:2]

    # Heavy Gaussian blur — merges text/outlines into solid blobs
    # Kernel ~1/3 of estimated cell size, must be odd
    blur_k = max(3, (img_h // BIG_ROAD_ROWS) // 3)
    blur_k = blur_k if blur_k % 2 == 1 else blur_k + 1
    blurred = cv2.GaussianBlur(image, (blur_k, blur_k), 0)

    hsv_blurred = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)
    # Also convert unblurred image for tie detection (green marks are small)
    hsv_raw = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    cell_size = estimate_cell_size(img_h)
    rows = max(1, img_h // cell_size)
    cols = max(1, img_w // cell_size)

    # Scan grid, using center 60% of each cell to avoid border artifacts
    margin = cell_size // 5  # skip 20% on each side
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

            # Double-check tie on raw image (blur can wash out small green marks)
            if result in ("B", "P") and not has_tie_blurred:
                has_tie_blurred = classify_cell_unblurred(hsv_raw[y1:y2, x1:x2])

            if result:
                cells.append({
                    "result": result,
                    "has_tie": has_tie_blurred if result in ("B", "P") else False,
                    "col": col,
                    "row": row,
                    "x": col * cell_size + cell_size // 2,
                    "y": row * cell_size + cell_size // 2,
                    "w": cell_size,
                    "h": cell_size,
                })

    return {
        "cells": cells,
        "grid_rows": rows,
        "grid_cols": cols,
        "cell_size": cell_size,
        "segment_offset": seg_y_offset,
        "segments_found": len(segments),
    }


def grid_to_sequence(cells: List[dict]) -> List[str]:
    """Column-by-column, top to bottom (Big Road reading order).

    Ties are inserted after the B/P result they're attached to.
    """
    if not cells:
        return []

    columns: dict = {}
    for c in cells:
        col = c["col"]
        if col not in columns:
            columns[col] = []
        columns[col].append(c)

    sequence = []
    for col_idx in sorted(columns.keys()):
        col_cells = sorted(columns[col_idx], key=lambda c: c["row"])
        for c in col_cells:
            sequence.append(c["result"])
            # If this B/P cell has a tie marker, insert a T after it
            if c.get("has_tie"):
                sequence.append("T")

    return sequence


def generate_debug_image(image: np.ndarray, cells: List[dict], cell_size: int,
                         segment_offset: int = 0, segments: List[Tuple[int, int]] = None) -> str:
    """Draw detection grid overlay and return as base64 PNG data URL.

    If segments were found, draw segment boundaries on the full image to show
    which region was selected as Big Road.
    """
    vis = image.copy()
    color_map = {"B": (0, 0, 255), "P": (255, 0, 0), "T": (0, 180, 0)}

    for c in cells:
        x1 = c["col"] * cell_size
        y1 = c["row"] * cell_size
        clr = color_map.get(c["result"], (128, 128, 128))
        cv2.rectangle(vis, (x1, y1), (x1 + cell_size, y1 + cell_size), clr, 2)
        label = c["result"]
        if c.get("has_tie"):
            label += "+T"
        cv2.putText(vis, label, (x1 + 4, y1 + cell_size - 4),
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

    # Crop to region first
    cropped = image
    if region:
        x, y, w, h = region
        ih, iw = image.shape[:2]
        x, y = max(0, min(x, iw)), max(0, min(y, ih))
        w, h = min(w, iw - x), min(h, ih - y)
        if w > 0 and h > 0:
            cropped = image[y:y+h, x:x+w]

    grid = detect_grid(image, region)
    cells = grid["cells"]
    sequence = grid_to_sequence(cells)

    # Generate debug image on the segmented (Big Road) portion
    seg_offset = grid.get("segment_offset", 0)
    if region:
        x, y, w, h = region
        ih, iw = image.shape[:2]
        x, y = max(0, min(x, iw)), max(0, min(y, ih))
        w, h = min(w, iw - x), min(h, ih - y)
        if w > 0 and h > 0:
            debug_base = image[y:y+h, x:x+w]
    else:
        debug_base = image

    if seg_offset > 0:
        seg_h = grid["grid_rows"] * grid["cell_size"]
        debug_base = debug_base[seg_offset:seg_offset+seg_h, :]

    debug_img = generate_debug_image(debug_base, cells, grid["cell_size"])

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
            "segments_found": grid["segments_found"],
        },
        "debug_image": debug_img,
    }
