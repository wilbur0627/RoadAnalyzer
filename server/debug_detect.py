"""
Debug script — visualize grid-based detection.
Usage: python debug_detect.py <screenshot.png> [x y w h]
"""
import sys
import cv2
from road_detector import analyze_image

def main():
    if len(sys.argv) < 2:
        print("Usage: python debug_detect.py <image> [x y w h]")
        return

    with open(sys.argv[1], "rb") as f:
        image_bytes = f.read()

    region = None
    if len(sys.argv) >= 6:
        region = (int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))

    result = analyze_image(image_bytes, region)

    if "error" in result:
        print(f"Error: {result['error']}")
        return

    grid = result.get("grid_info", {})
    print(f"Grid: {grid.get('cols')}x{grid.get('rows')}, cell_size={grid.get('cell_size')}px")
    print(f"Sequence ({result['total']}): {''.join(result['sequence'])}")
    print(f"B={result['banker_count']} P={result['player_count']} T={result['tie_count']}")

    # Draw visualization
    image = cv2.imread(sys.argv[1])
    if region:
        x, y, w, h = region
        image = image[y:y+h, x:x+w]

    cs = grid.get("cell_size", 1)
    color_map = {"B": (0, 0, 255), "P": (255, 0, 0), "T": (0, 180, 0)}

    # Draw grid lines
    for c in result["cells"]:
        x1 = c["col"] * cs
        y1 = c["row"] * cs
        clr = color_map.get(c["result"], (128, 128, 128))
        cv2.rectangle(image, (x1, y1), (x1 + cs, y1 + cs), clr, 2)
        cv2.putText(image, c["result"], (x1 + 4, y1 + cs - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, clr, 1)

    cv2.imwrite("debug_grid.png", image)
    print("Saved: debug_grid.png")


if __name__ == "__main__":
    main()
