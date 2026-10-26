"""Tests for reading the Big Road back into a sequence (server/road_detector.py).

Needs the server requirements (cv2, numpy); run inside the python:3.12-slim container:
    python -m unittest discover -s tests/server
"""
import os
import random
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "server"))

from road_detector import BIG_ROAD_ROWS, _big_road_order, grid_to_sequence  # noqa: E402


def big_road_cells(sequence, occupied=()):
    """Draw a sequence the way the Big Road does (mirrors src/roads/layout.ts).

    Returns cells shaped like detect_grid() reports them, plus the column
    their streak started in. A tie marks the previous cell, and only once, as
    the detector can only see one tie mark. `occupied` positions are already
    taken, like the tails of streaks that started off screen.
    """
    streaks = []
    for outcome in sequence:
        if outcome == "T":
            if streaks:
                streaks[-1][-1]["has_tie"] = True
            continue
        if streaks and streaks[-1][0]["result"] == outcome:
            streaks[-1].append({"result": outcome, "has_tie": False})
        else:
            streaks.append([{"result": outcome, "has_tie": False}])

    occupied = set(occupied)
    cells = []
    start = 0
    for streak in streaks:
        while (start, 0) in occupied:
            start += 1
        col, row, turned = start, 0, False
        for i, cell in enumerate(streak):
            if i > 0:
                if not turned and row + 1 < BIG_ROAD_ROWS and (col, row + 1) not in occupied:
                    row += 1
                else:
                    turned = True
                    col += 1
                    while (col, row) in occupied:
                        col += 1
            occupied.add((col, row))
            cells.append({**cell, "col": col, "row": row, "start": start})
        start += 1
    return cells


def scroll(cells, columns):
    """The road once its first `columns` columns have scrolled out of view"""
    return [dict(c, col=c["col"] - columns, start=c["start"] - columns) for c in cells if c["col"] >= columns]


def hands(cells):
    """The hands these cells hold, in the order they are listed"""
    sequence = []
    for c in cells:
        sequence.append(c["result"])
        if c["has_tie"]:
            sequence.append("T")
    return sequence


def drawn(cells):
    """What the road looks like, regardless of the order the cells were listed in"""
    return sorted((c["col"], c["row"], c["result"], c["has_tie"]) for c in cells)


def assert_reads_back(test, cells, label):
    """The reading leaves out only tails on the left edge and draws the rest exactly"""
    ordered = _big_road_order(cells)
    test.assertIsNotNone(ordered, label)
    offscreen = [c for c in cells if c not in ordered]
    for row in range(BIG_ROAD_ROWS):
        tail = sorted((c["col"], c["result"]) for c in offscreen if c["row"] == row)
        test.assertEqual([col for col, _ in tail], list(range(len(tail))), label)
        test.assertLessEqual(len({color for _, color in tail}), 1, label)
    redrawn = big_road_cells(hands(ordered), occupied={(c["col"], c["row"]) for c in offscreen})
    test.assertEqual(drawn(redrawn), drawn(ordered), label)
    return hands(ordered)


def column_order(cells):
    """The previous reading: column by column, top to bottom"""
    sequence = []
    for c in sorted(cells, key=lambda c: (c["col"], c["row"])):
        sequence.append(c["result"])
        if c["has_tie"]:
            sequence.append("T")
    return sequence


def read(sequence):
    return "".join(grid_to_sequence(big_road_cells(sequence)))


class GridToSequenceTest(unittest.TestCase):
    def test_columns_without_dragon_tails(self):
        self.assertEqual(read("BBPPPBP"), "BBPPPBP")

    def test_ties_follow_their_cell(self):
        self.assertEqual(read("BTBBPTP"), "BTBBPTP")

    def test_dragon_tail_belongs_to_its_streak(self):
        # 8 Banker: the tail turns right along the bottom row, past the Player column
        sequence = "B" * 8 + "PP"
        self.assertEqual(read(sequence), sequence)
        # The old column-by-column reading put the Players inside the dragon
        self.assertNotEqual("".join(column_order(big_road_cells(sequence))), sequence)

    def test_column_that_turns_early_above_a_tail(self):
        sequence = "B" * 8 + "P" * 7 + "B"
        self.assertEqual(read(sequence), sequence)

    def test_nested_tails(self):
        sequence = "".join(("B" if i % 2 == 0 else "P") * n for i, n in enumerate([8, 7, 6, 5, 4, 3, 1]))
        self.assertEqual(read(sequence), sequence)

    def test_ambiguous_road_reads_the_earlier_dragon_long(self):
        # Both sequences draw exactly the same road
        short_dragon = "B" * 7 + "P" + "B" * 6
        long_dragon = "B" * 8 + "P" + "B" * 5
        self.assertEqual(drawn(big_road_cells(short_dragon)), drawn(big_road_cells(long_dragon)))
        self.assertEqual(read(short_dragon), long_dragon)

    def test_streak_that_turned_above_a_tail_from_off_screen(self):
        # Scrolled off on the left: a tail from an earlier, invisible column sits in column 0
        cells = [{"result": "P", "has_tie": False, "col": 0, "row": r} for r in range(5)]
        cells.append({"result": "B", "has_tie": False, "col": 0, "row": 5})
        cells.append({"result": "P", "has_tie": False, "col": 1, "row": 4})
        self.assertEqual("".join(grid_to_sequence(cells)), "PPPPPP")

    def test_dragon_tail_left_behind_by_scrolling(self):
        # The 8 Banker started in the column that scrolled away; its tail and tie stay on screen
        road = big_road_cells("B" * 8 + "T" + "PBBPPP")
        self.assertEqual("".join(grid_to_sequence(scroll(road, 1))), "PBBPPP")

    def test_nested_tails_left_behind_by_scrolling(self):
        # Both tails on screen started in columns that scrolled away
        road = big_road_cells("B" * 8 + "P" * 7 + "B" * 6 + "PPBPPP")
        self.assertEqual("".join(grid_to_sequence(scroll(road, 3))), "PPBPPP")

    def test_ambiguous_scrolled_road_reads_the_fewest_cells_off_screen(self):
        # Five Banker above the tail of an off-screen dragon draw the same column as six Banker
        road = scroll(big_road_cells("B" * 8 + "P" + "B" * 5 + "P"), 2)
        self.assertEqual(drawn(road), drawn(big_road_cells("B" * 6 + "P")))
        self.assertEqual("".join(grid_to_sequence(road)), "BBBBBBP")

    def test_falls_back_when_cells_do_not_form_a_big_road(self):
        # No streak can reach a cell in the middle of a column without one at its top
        cells = [
            {"result": "B", "has_tie": False, "col": 0, "row": 0},
            {"result": "P", "has_tie": False, "col": 1, "row": 3},
        ]
        self.assertEqual(grid_to_sequence(cells), column_order(cells))

    def test_falls_back_on_tails_without_a_streak_start(self):
        cells = [{"result": "B", "has_tie": False, "col": c, "row": 5} for c in range(3)]
        self.assertEqual(grid_to_sequence(cells), column_order(cells))

    def test_falls_back_on_a_cell_with_only_a_tie_mark(self):
        cells = big_road_cells("BBPB")
        cells.append({"result": "T", "has_tie": False, "col": 5, "row": 0})
        self.assertEqual(grid_to_sequence(cells), column_order(cells))

    def test_empty_road(self):
        self.assertEqual(grid_to_sequence([]), [])

    def test_random_shoes_read_back_to_the_same_road(self):
        rng = random.Random(20261025)
        exact = 0
        for _ in range(3000):
            sequence = []
            for _ in range(rng.randint(1, 80)):
                sequence.append(rng.choice("BP"))
                if rng.random() < 0.1:
                    sequence.append("T")
            cells = big_road_cells(sequence)
            result = grid_to_sequence(cells)

            # Whatever the reading, it must draw exactly the detected road
            self.assertEqual(drawn(big_road_cells(result)), drawn(cells), "".join(sequence))
            # No streak longer than the road is tall means no turns, so no ambiguity
            runs = re.findall(r"B+|P+", "".join(o for o in sequence if o != "T"))
            if max(map(len, runs)) <= BIG_ROAD_ROWS:
                self.assertEqual(result, sequence, "".join(sequence))
            exact += result == sequence
        # The rest are roads that two different shoes draw identically
        self.assertGreater(exact, 2950)

    def test_random_scrolled_shoes_read_back_the_streaks_that_start_on_screen(self):
        rng = random.Random(20261026)
        exact = 0
        for _ in range(3000):
            sequence = []
            for _ in range(rng.randint(2, 80)):
                sequence.append(rng.choice("BP"))
                if rng.random() < 0.1:
                    sequence.append("T")
            road = big_road_cells(sequence)
            # A scrolling road keeps its newest columns in view, so the last streak still starts on screen
            last_start = max(c["start"] for c in road)
            if last_start < 1:
                continue
            cut = rng.randint(1, last_start)
            visible = scroll(road, cut)
            label = f"{''.join(sequence)} scrolled by {cut}"

            result = assert_reads_back(self, visible, label)
            self.assertEqual(grid_to_sequence(visible), result, label)
            expected = hands(c for c in visible if c["start"] >= 0)
            # No streak longer than the road is tall means no tails, so whole streaks scroll away
            runs = re.findall(r"B+|P+", "".join(o for o in sequence if o != "T"))
            if max(map(len, runs)) <= BIG_ROAD_ROWS:
                self.assertEqual(result, expected, label)
            exact += result == expected
        # The rest are roads that two different shoes draw identically (2955 of 2960 at this seed)
        self.assertGreater(exact, 2920)


if __name__ == "__main__":
    unittest.main()
