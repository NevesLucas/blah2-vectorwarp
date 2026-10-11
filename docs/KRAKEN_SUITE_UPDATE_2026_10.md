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

Hosted Linux ARM and Intel Mac checks have not run for this update.
Existing historical physical and CI results in the macOS test matrix apply to
their recorded earlier source revisions.

The receiver-update catalog acknowledges this reviewed source identity. As with
other catalog entries, that acknowledgement is not a hardware compatibility
claim; the software results and limits are recorded here.

No Kraken was attached for this work. These tests do not establish physical USB
throughput, RF coherence, oscillator drift, real gain behavior or antenna results.
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
