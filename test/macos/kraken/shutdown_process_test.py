#!/usr/bin/env python3
"""Make native process aborts explicit before checking driver cleanup events."""
import signal
import subprocess
import unittest
from unittest.mock import Mock

from native_simulation_test import stop


class ShutdownProcess(unittest.TestCase):
    def process(self, returncode, live=True):
        process = Mock()
        process.poll.return_value = None if live else returncode
        process.wait.return_value = returncode
        return process

    def test_success_keeps_signal_and_deadline_contract(self):
        process = self.process(0)
        stop(process)
        process.send_signal.assert_called_once_with(signal.SIGTERM)
        process.wait.assert_called_once_with(timeout=10)
        process.kill.assert_not_called()

    def test_native_abort_reports_signal(self):
        process = self.process(-signal.SIGABRT)
        with self.assertRaisesRegex(AssertionError, r'returncode=-6 \(SIGABRT\)'):
            stop(process)
        process.kill.assert_not_called()

    def test_already_aborted_process_still_fails(self):
        process = self.process(-signal.SIGABRT, live=False)
        with self.assertRaisesRegex(AssertionError, 'SIGABRT'):
            stop(process)
        process.send_signal.assert_not_called()

    def test_nonzero_normal_exit_still_fails(self):
        with self.assertRaisesRegex(AssertionError, 'returncode=1'):
            stop(self.process(1))

    def test_timeout_still_kills_and_fails(self):
        process = self.process(-signal.SIGKILL)
        process.wait.side_effect = [subprocess.TimeoutExpired('heimdall', 10), -signal.SIGKILL]
        with self.assertRaisesRegex(AssertionError, 'did not stop within10s'):
            stop(process)
        process.kill.assert_called_once_with()
        self.assertEqual([call.kwargs['timeout'] for call in process.wait.call_args_list], [10, 5])


if __name__ == '__main__':
    unittest.main()
