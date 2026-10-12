# Kraken Suite software compatibility, October 2026

This update targets KrakenSDR Suite main commit
[`f648514df41d90efd89984edad8b83c3680167f5`](https://github.com/krakenrf/krakensdr_suite/commit/f648514df41d90efd89984edad8b83c3680167f5).
It is an immutable source revision, not an upstream tagged release. The native
companion previously used `a541354bc4fa02261cb521d98937842591e8ce27`.

## Behavior that affects radar

- Upstream calibration now corrects phase only. The native tests require phase
  residuals no greater than 1 degree, zero integer sample lag, and preservation
  of known injected channel gain offsets. They no longer require the previous
  amplitude normalization behavior.
- Startup and manual/automatic gain changes use upstream's fixed IF-VGA settings.
  Direct diagnostic IF-VGA overrides are refused in coherent mode by the patched
  companion; normal `set_gain` remains supported.
- VectorWarp rejects wideband and independent-tuner frames even when their low
  calibration-state byte says calibrated. Those modes do not supply the coherent
  input needed for passive radar.
- The native companion retains upstream's eight-client limit and bounded TCP
  tail buffering. It marks sample gaps in each affected client's continuity
  counter so VectorWarp resets its CPI buffers. A stalled client does not change
  another client's continuity counter or block its progress.
- Calibration failures remain failures, including watchdog timeout and partial
  device-setting errors. Noise transitions, acquisition epochs, filter-history
  reset and shutdown ownership checks remain enforced.

When VectorWarp settings synchronization switches manual gain to AUTO, it asks
Suite to perform its existing full recalibration after the gain command is
acknowledged. Retuning while AUTO remains selected uses the same sequence,
including when gain is set to Keep. A disabled scanner and normal coherent,
internal-noise operation are required. The client sends one reset, waits for its
acknowledgment, then requires newly reported recovery and later completion.
Failure or timeout prevents the configuration save; it does not retry the reset
or silently substitute manual gain. Manual-gain and unchanged settings retain
their existing behavior.

This uses Suite's supported control interface without changing its calibration
timing, accuracy thresholds or gain algorithm. Stock Linux status messages are
supported: the client checks additional calibration fields when present but does
not treat absent fields as physical calibration measurements.

Kraken's experimental ADS-B/AIS tracking and viewshed interface are separate
upstream applications. This compatibility work does not add those interfaces
to VectorWarp.

## Software evidence and limits

The Apple M2 development Mac built the native controller and passed all seven
fake-driver scenarios. These cover zero devices, failed setup, failed noise
switching, partial tuning failure, short callbacks, shutdown during channel
reconfiguration, and coherent capture with retune/gain/loss recovery. The
coherence case received 2,859 frames; the largest measured phase error was
0.23545 degrees, the largest gain-offset error was 0.01136 dB, and all checked
integer lags were zero.

The actual VectorWarp socket receiver passed 14 loopback cases on both Apple
Silicon macOS and Fedora 44 x86_64. Mac frame-decoder unit tests passed 50
assertions across five cases. The TCP server regression exercises the actual
native broadcast loop, including blocked/resumed clients, intact framing,
continuity changes, hard disconnects, and admission of at most eight clients.

Fedora 44 x86_64 also built the native controller and passed all seven scenarios.
Its coherence case received 3,375 frames; the largest measured phase error was
0.22429 degrees, the largest gain-offset error was 0.00974 dB, and all checked
integer lags were zero. The three existing production service states were
unchanged before and after the isolated tests.

The Mac additionally passed the full simulated controller-to-processor-to-API
path: fresh frames, repeated-start idempotence, retune/Save & Restart, owner-crash
cleanup, native-crash recovery and complete supervisor shutdown. This used the
updated companion and current source API/lifecycle with the existing installed
Homebrew revision 17 processor. The new frame-decoder changes were compiled and
tested separately; the full processor was not rebuilt for this local check.

Revision `50548a3554d4`, including the VectorWarp AUTO command sequence, passed
all 24 hosted checks. These include Linux x86_64/ARM64 native simulations and
CPU/API tests, macOS arm64/x86_64 builds and standalone runtimes, and all 11 Linux
package targets. Three publication jobs intentionally skipped the draft PR.
See the [CPU/API and native checks](https://github.com/mickeyslaven/blah2-VectorWarp/actions/runs/38203415283),
[Mac checks](https://github.com/mickeyslaven/blah2-VectorWarp/actions/runs/38203415309),
[standalone runtimes](https://github.com/mickeyslaven/blah2-VectorWarp/actions/runs/38203415289),
[Linux packages](https://github.com/mickeyslaven/blah2-VectorWarp/actions/runs/38203415320)
and [Homebrew policy](https://github.com/mickeyslaven/blah2-VectorWarp/actions/runs/38203415330).
These PR results do not publish packages or establish release availability.

The receiver-update catalog acknowledges this reviewed source identity. As with
other catalog entries, that acknowledgement is not a hardware compatibility
claim; the software results and limits are recorded here.

Later physical tests on the Apple M2 exercised all five USB channels, manual
gain, retuning, recovery and the controller-to-CPU-to-API settings path. Six
API/settings phases each produced 19 fresh finite map observations. Two whole
frame drops and two frequency-mismatch messages occurred at retune handovers;
this is not a zero-loss result.

AUTO calibration failed with both the prior receiver version and the updated
Suite, including with the new antenna array connected. Measurements showed phase
motion continuing beyond the upstream 250 ms readiness gate. Rather than adopt
a native timing patch, we tested Suite's existing full-recalibration command
immediately after each AUTO acknowledgment. Three transitions passed with fresh
five-channel output, each taking about five seconds. The unchanged periodic
check also passed: eight snapshots over 1.16 seconds, worst per-channel mean
absolute residuals of 3.90 degrees and 0.0147 samples. The complete directed test
took 61 seconds, used about 96 MiB of receiver memory and shut down cleanly.

A subsequent 45-second physical test used the actual VectorWarp Node control
client. Manual-to-AUTO gain and retuning with gain set to Keep both passed in
about five seconds each, with acknowledged recovery, newer converged status and
fresh valid five-channel output. Both client calls exited successfully; final
manual restoration and all-channel shutdown passed. The API test suite also
passed, including the new recovery protocol cases. This exercised the control
client directly, not a browser/HTTP session or a new CPU/GPU radar run.

A subsequent 47-second Fedora 44 x86_64 test used pristine upstream Suite at the
same pinned revision and the actual VectorWarp Node client with five USB channels.
Manual-to-AUTO and retuning with gain Keep each completed in 5.52 seconds, with
observed recovery followed by newly received valid five-channel frames. Unchanged
settings issued no setting writes. The original periodic check completed in
1.42 seconds and logged worst phase/lag values of 2.2 degrees and zero samples.
Manual restoration, receiver exit and all five original kernel-driver bindings
were verified; no raw IQ was saved. This Linux native/control evidence passed
independent review. The current HP CPU and capture-core build also passed
independent artifact/dependency review.

A separate 55-second live HP test then passed all five controller-to-CPU-to-API
stages: initial manual 527 MHz/40 dB, Save & Restart at 528 MHz/20 dB, restoration
to 527 MHz/40 dB, stop/start, and restart. Every stage produced fresh finite map
output. Restarts changed both API and CPU process identities, and the API loaded
the saved configuration revision. Noise was disabled, the native receiver exited
successfully, all five original kernel-driver bindings were restored, and no
owned radio processes remained. No raw IQ was saved. This final pipeline evidence
passed independent review.

This live pipeline used one surveillance worker, one FFT thread and a 200 ms CPI.
The native log reported 69 dropped packets across three reports; the processor
logged two frequency mismatches at handover. The 28 measured CPI processing times
ranged from 397.7 to
560.0 ms (median 430.4 ms). This is bounded functional processing and restart
evidence, not lossless or real-time throughput, full multi-worker performance or
GPU qualification.

These finite tests do not establish AUTO convergence without a reset, external
RF coherence after switching back to the antennas, antenna geometry,
bearing/target accuracy, long-term drift, or physical Intel Mac behavior. Stock
Linux status does not provide the companion's acquisition epoch or all of its
calibration fields; the control receipt does not claim measured calibration or
hardware verification. These directed hardware results passed review; final
exact-tree and release acceptance remain pending.
The fake driver has no USB implementation. Linux tests first compile the real
static-driver target without executing it, then explicitly relink native objects
with the fake driver and verify hashes, link maps and loader dependencies before
every simulated process. See the [test instructions](../test/macos/kraken/README.md).

The Linux native simulation uses the same patched source as the companion. It
does not install or modify an external Linux Kraken service. In particular, the
per-client gap notification described above is a companion patch; unmodified
upstream Suite does not include it. Updating VectorWarp alone cannot change an
independently installed upstream daemon.

The upstream Suite still supplies no repository-wide license file. Existing
source-build and no-bottles restrictions remain; these tests do not authorize
redistribution of upstream native binaries.
