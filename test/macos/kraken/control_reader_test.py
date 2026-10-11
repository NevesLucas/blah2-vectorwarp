#!/usr/bin/env python3
"""Verify native simulation's control freshness gate without a native process."""
import collections
import threading
import unittest
from unittest.mock import patch

from native_simulation_test import Control


class ControlFreshness(unittest.TestCase):
    def reader(self, messages):
        reader = Control.__new__(Control)
        reader.lock = threading.Lock()
        reader.messages = collections.deque(messages, maxlen=128)
        reader.error = None
        return reader

    def status(self, sequence, frequency=101000000, gain=50, state="CONVERGED"):
        return {"_fixtureSequence": sequence, "calibration_state": state,
                "settings": {"center_freq": frequency, "gain": gain}}

    def test_stale_identical_status_cannot_satisfy_restored_gain(self):
        reader = self.reader([self.status(7), self.status(8, gain=-1)])
        # Exercise the actual wait loop once, then expire its deadline without
        # sleeping or creating sockets. Sequence equal to the cutoff is stale.
        with patch("native_simulation_test.time.monotonic", side_effect=[0, 0, 2]), \
                patch("native_simulation_test.time.sleep"):
            with self.assertRaisesRegex(AssertionError, "after message 7"):
                reader.wait_calibrated(101000000, timeout=1, gain=50, after=7)

    def test_fresh_matching_status_is_required(self):
        reader = self.reader([self.status(7)])
        fresh = [self.status(8, frequency=100000000), self.status(9, gain=-1),
                 self.status(10, state="PENDING"), self.status(11)]
        def publish_next(_):
            reader.messages.append(fresh.pop(0))
        with patch("native_simulation_test.time.monotonic", return_value=0), \
                patch("native_simulation_test.time.sleep", side_effect=publish_next) as sleep:
            reader.wait_calibrated(101000000, timeout=1, gain=50, after=7)
        self.assertEqual(sleep.call_count, 4)
        self.assertFalse(fresh)

    def test_initial_reader_remains_compatible(self):
        reader = self.reader([self.status(1)])
        reader.wait_calibrated(101000000, gain=50)


if __name__ == "__main__":
    unittest.main()
