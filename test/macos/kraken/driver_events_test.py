#!/usr/bin/env python3
"""Bounded regression for complete-record snapshots of the live driver log."""
import json
from pathlib import Path
import tempfile
import unittest

from native_simulation_test import driver_events


class DriverEvents(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.log = self.work / "driver.jsonl"

    def test_split_record_becomes_visible_only_after_newline(self):
        self.log.write_bytes(b'{"event":"open"}\n{"event":"read_')
        self.assertEqual(driver_events(self.work), [{"event": "open"}])
        with self.log.open("ab") as output:
            output.write(b'start"}')
        self.assertEqual(driver_events(self.work), [{"event": "open"}])
        with self.log.open("ab") as output:
            output.write(b'\n')
        self.assertEqual(driver_events(self.work, complete=True),
                         [{"event": "open"}, {"event": "read_start"}])

    def test_complete_malformed_record_still_fails(self):
        self.log.write_bytes(b'{"event":bad}\n{"event":"incomplete')
        with self.assertRaises(json.JSONDecodeError):
            driver_events(self.work)
        self.log.write_bytes(b'{"event":bad}\n')
        with self.assertRaises(json.JSONDecodeError):
            driver_events(self.work, complete=True)

    def test_shutdown_rejects_unterminated_record(self):
        for tail in (b'{"event":"close"}', b'{"event":"clo'):
            with self.subTest(tail=tail):
                self.log.write_bytes(b'{"event":"open"}\n' + tail)
                with self.assertRaisesRegex(AssertionError, "incomplete final record after shutdown"):
                    driver_events(self.work, complete=True)

    def test_partial_utf8_tail_does_not_break_live_snapshot(self):
        self.log.write_bytes(b'{"event":"open"}\n{"event":"\xc3')
        self.assertEqual(driver_events(self.work), [{"event": "open"}])

    def test_missing_and_empty_files_have_no_events(self):
        self.assertEqual(driver_events(self.work), [])
        self.log.write_bytes(b'')
        self.assertEqual(driver_events(self.work, complete=True), [])


if __name__ == "__main__":
    unittest.main()
