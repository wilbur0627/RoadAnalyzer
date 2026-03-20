"""
Baccarat Road Detector — Blur + Grid approach.

Key insight: heavily blur the image FIRST so text characters (莊/閒/和),
outlines, and solid circles all become uniform color blobs.
Then classify each grid cell by dominant color.
"""

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


def color_pixel_count(hsv: np.ndarray, color: str) -> int:
    """Count pixels matching a color in an HSV region."""
    total = 0
    for lower, upper in COLOR_RANGES[color]:
        total += cv2.countNonZero(cv2.inRange(hsv, lower, upper))
    return total


def classify_cell(hsv_cell: np.ndarray) -> Optional[str]:
    """Classify a grid cell. Returns 'B', 'P', 'T', or None (empty)."""
    area = hsv_cell.shape[0] * hsv_cell.shape[1]
    if area == 0:
        return None

    counts = {c: color_pixel_count(hsv_cell, c) for c in ["B", "P", "T"]}
    best = max(counts, key=counts.get)  # type: ignore[arg-type]

    if counts[best] < area * MIN_COLOR_RATIO:
        return None
    return best


def estimate_cell_size(img_h: int) -> int:
    """Big Road always has 6 rows. Cell size = image height / 6."""
    return max(8, img_h // BIG_ROAD_ROWS)


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

    img_h, img_w = image.shape[:2]

    # Heavy Gaussian blur — merges text/outlines into solid blobs
    # Kernel ~1/3 of estimated cell size, must be odd
    blur_k = max(3, (img_h // BIG_ROAD_ROWS) // 3)
    blur_k = blur_k if blur_k % 2 == 1 else blur_k + 1
    blurred = cv2.GaussianBlur(image, (blur_k, blur_k), 0)

    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)

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

            result = classify_cell(hsv[y1:y2, x1:x2])
            if result:
                cells.append({
                    "result": result,
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

    return sequence


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
        },
    }
