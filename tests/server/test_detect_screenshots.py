"""Detection on rendered and real screenshots (server/road_detector.py).

Needs the server requirements (cv2, numpy); run inside the python:3.12-slim container:
    python -m unittest discover -s tests/server
The real screenshots live in screenshots/, which is not in version control;
those tests are skipped when the files are missing.
"""
import os
import random
import sys
import unittest

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "server"))
sys.path.insert(0, HERE)

from road_detector import analyze_image  # noqa: E402
from test_road_detector import big_road_cells, scroll  # noqa: E402

SCREENSHOTS = os.path.join(HERE, "..", "..", "screenshots")

RED, BLUE, GREEN, WHITE = (40, 40, 235), (235, 100, 30), (60, 200, 40), (255, 255, 255)  # BGR
PITCH, LEFT, TOP = 23.4, 12.0, 48.5


def centre(col, row):
    return int(round(LEFT + col * PITCH)), int(round(TOP + row * PITCH))


def render_panel(sequence, pairs=(), header=True, derived=True, scrolled=0):
    """A road panel like the casino's: header badges, Big Road, derived roads below.
    `scrolled` columns of the Big Road have scrolled out of view on the left."""
    img = np.full((250, 430, 3), 255, np.uint8)
    if header:
        cv2.rectangle(img, (0, 0), (429, 36), (30, 26, 24), -1)
        cv2.rectangle(img, (14, 9), (70, 29), BLUE, -1)
        cv2.rectangle(img, (74, 9), (130, 29), RED, -1)
        # Filled badges with a white glyph, the size of a Big Road circle
        for cx, color in ((206, RED), (250, BLUE)):
            cv2.circle(img, (cx, 19), 10, color, -1, cv2.LINE_AA)
            for dy in (-4, 0, 4):
                cv2.line(img, (cx - 5, 19 + dy), (cx + 5, 19 + dy), WHITE, 1)
            cv2.line(img, (cx, 12), (cx, 26), WHITE, 1)

    for cell in scroll(big_road_cells(sequence), scrolled):
        x, y = centre(cell["col"], cell["row"])
        color = RED if cell["result"] == "B" else BLUE
        cv2.circle(img, (x, y), 8, color, 3, cv2.LINE_AA)
        if cell["has_tie"]:
            cv2.line(img, (x - 9, y + 9), (x + 9, y - 9), GREEN, 3, cv2.LINE_AA)
        if (cell["col"], cell["row"]) in pairs:
            # A pair dot over the circle's edge, in the other color, and one in the same color
            cv2.circle(img, (x - 6, y - 6), 3, BLUE if color == RED else RED, -1, cv2.LINE_AA)
            cv2.circle(img, (x + 6, y + 6), 3, color, -1, cv2.LINE_AA)

    if derived:
        for i in range(10):
            cv2.circle(img, (int(8 + i * 11.7), 190), 5, RED if i % 2 else BLUE, 2, cv2.LINE_AA)
            cv2.circle(img, (int(150 + i * 11.7), 190), 4, BLUE if i % 2 else RED, -1, cv2.LINE_AA)
            x = int(290 + i * 11.7)
            cv2.line(img, (x - 4, 194), (x + 4, 186), RED if i % 2 else BLUE, 2, cv2.LINE_AA)
    return cv2.imencode(".png", img)[1].tobytes()


def render_big_road(sequence, pitch):
    """Just a Big Road, at any cell pitch (e.g. 20.4 px at 125% zoom), with circles scaled to match."""
    cells = big_road_cells(sequence)
    cols = max(c["col"] for c in cells) + 1
    left, top = pitch / 2 + 1.3, pitch / 2 + 0.7  # not on whole pixels
    img = np.full((int(top * 2 + 6 * pitch), int(left * 2 + cols * pitch), 3), 255, np.uint8)
    radius, thickness = round(8 * pitch / PITCH), max(2, round(3 * pitch / PITCH))
    for cell in cells:
        x, y = int(round(left + cell["col"] * pitch)), int(round(top + cell["row"] * pitch))
        cv2.circle(img, (x, y), radius, RED if cell["result"] == "B" else BLUE, thickness, cv2.LINE_AA)
        if cell["has_tie"]:
            cv2.line(img, (x - radius - 1, y + radius + 1), (x + radius + 1, y - radius - 1), GREEN, thickness, cv2.LINE_AA)
    return cv2.imencode(".png", img)[1].tobytes()


def drawn(sequence):
    """The road a sequence draws; two shoes can draw the same one"""
    return sorted((c["col"], c["row"], c["result"], c["has_tie"]) for c in big_road_cells(sequence))


def detect(image_bytes):
    return "".join(analyze_image(image_bytes)["sequence"])


class RenderedPanelTest(unittest.TestCase):
    # Tie on the first circle, a 7-long dragon whose tail turns right
    SHOE = "BTPPBPBPBPPPBBPBBPPPPPPPBPBPBBPP"

    def test_reads_the_big_road_past_header_badges_and_derived_roads(self):
        self.assertEqual(detect(render_panel(self.SHOE, pairs={(1, 0), (7, 1), (11, 2)})), self.SHOE)

    def test_reads_a_selection_of_just_the_big_road(self):
        self.assertEqual(detect(render_panel(self.SHOE, header=False, derived=False)), self.SHOE)

    def test_reads_a_short_shoe(self):
        self.assertEqual(detect(render_panel("PPBPBBPBPBBBB")), "PPBPBBPBPBBBB")

    def test_reads_wide_roads_at_fractional_pitches(self):
        # A pitch measured from whole-pixel circles is a little off; over 35+ columns
        # that used to shift the far columns by a whole cell
        rng = random.Random(7)
        shoes = []
        while len(shoes) < 4:
            shoe = "".join(rng.choice("BP") + ("T" if rng.random() < 0.08 else "") for _ in range(rng.randint(60, 110)))
            if max(c["col"] for c in big_road_cells(shoe)) + 1 >= 35:
                shoes.append(shoe)
        for pitch in (19.3, 20.4, 21.6, 25.5):
            for shoe in shoes:
                with self.subTest(pitch=pitch, shoe=shoe):
                    self.assertEqual(drawn(detect(render_big_road(shoe, pitch))), drawn(shoe))

    def test_leaves_out_the_tail_of_a_dragon_that_scrolled_away(self):
        # The 9 Banker's column scrolled out of view; its tail stays on the bottom row
        shoe = "PB" + "B" * 8 + "PPBTPBBPPPBPBBPPBP"
        self.assertEqual(detect(render_panel(shoe, scrolled=2)), "PPBTPBBPPPBPBBPPBP")

    def test_cells_carry_their_place_in_the_reading(self):
        shoe = "PB" + "B" * 8 + "PPBTPBBPPPBPBBPPBP"
        result = analyze_image(render_panel(shoe, scrolled=2))
        read = sorted((c for c in result["cells"] if c["order"] is not None), key=lambda c: c["order"])
        self.assertEqual([c["order"] for c in read], list(range(len(read))))
        self.assertEqual("".join(c["result"] + ("T" if c["has_tie"] else "") for c in read), "".join(result["sequence"]))
        # The three tail cells of the dragon that scrolled away are not read
        self.assertEqual([(c["col"], c["row"]) for c in result["cells"] if c["order"] is None], [(0, 5), (1, 5), (2, 5)])


def screenshot(name):
    path = os.path.join(SCREENSHOTS, name)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()


class RealScreenshotTest(unittest.TestCase):
    """Expected sequences were read by eye from the Big Road in each screenshot."""

    def check(self, name, expected):
        data = screenshot(name)
        if data is None:
            self.skipTest(f"screenshots/{name} is not available")
        self.assertEqual(detect(data), expected)

    def test_short_shoe(self):
        # Header: 13 hands, Banker 8, Player 5
        self.check("image1.png", "PPBPBBPBPBBBB")

    def test_scrolled_shoe_with_dragon_and_tie(self):
        # The visible 18 columns (32 of the shoe's 49 hands); 7 Players turn right on the bottom row
        self.check("image2.png", "BTPPBPBPBPPPBBPBBPPPPPPPBPBPBBPP")


if __name__ == "__main__":
    unittest.main()
