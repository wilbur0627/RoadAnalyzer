"""
Baccarat Road Detector — Blur + Grid approach with automatic Big Road isolation.

Key insight: heavily blur the image FIRST so text characters (莊/閒/和),
outlines, and solid circles all become uniform color blobs.
Then classify each grid cell by dominant color.

When the screenshot contains multiple road types (Big Road, Bead Plate,
Big Eye Boy, Small Road, Cockroach Pig), the detector automatically
isolates the Big Road by detecting circular colored blobs, clustering
them by diameter, and keeping only the largest cluster (Big Road circles
are bigger than derived road circles).

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
        "iso_offset": (iso_x, iso_y),
        "isolated": iso_x > 0 or iso_y > 0,
    }


def grid_to_sequence(cells: List[dict]) -> List[str]:
    """Column-by-column, top to bottom (Big Road reading order)."""
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
            if c.get("has_tie"):
                sequence.append("T")

    return sequence


def generate_debug_image(image: np.ndarray, cells: List[dict], cell_size: int) -> str:
    """Draw detection grid overlay and return as base64 PNG data URL."""
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

    grid = detect_grid(image, region)
    cells = grid["cells"]
    sequence = grid_to_sequence(cells)

    # Generate debug image on the isolated Big Road portion
    iso_x, iso_y = grid.get("iso_offset", (0, 0))
    if region:
        x, y, w, h = region
        ih, iw = image.shape[:2]
        x, y = max(0, min(x, iw)), max(0, min(y, ih))
        w, h = min(w, iw - x), min(h, ih - y)
        if w > 0 and h > 0:
            debug_base = image[y:y+h, x:x+w]
        else:
            debug_base = image
    else:
        debug_base = image

    if iso_x > 0 or iso_y > 0:
        seg_h = grid["grid_rows"] * grid["cell_size"]
        seg_w = grid["grid_cols"] * grid["cell_size"]
        debug_base = debug_base[iso_y:iso_y+seg_h, iso_x:iso_x+seg_w]

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
            "isolated": grid["isolated"],
        },
        "debug_image": debug_img,
    }
