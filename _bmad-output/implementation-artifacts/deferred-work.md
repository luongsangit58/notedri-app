# Deferred Work

- source_spec: none
  summary: src/services/obd/__tests__/obdFlow.test.ts fails to run because it imports the deleted fixture obd-fixtures/vgate-honda-city-20260713-02.json.
  evidence: Pre-existing uncommitted working-tree state (git status shows fixtures 01-04 deleted, not staged) unrelated to the OBD resilience fix in this change; confirm the fixture deletions are intentional and update or restore obdFlow.test.ts accordingly.

- source_spec: none
  summary: isPlausibleValue() silently converts an implausible sensor reading to null with no logging/telemetry, so downstream code can't distinguish "PID unsupported" from "value rejected as physically impossible".
  evidence: Blind Hunter review of the obd-resilience change (2026-07-14). Fixing this needs a signal/telemetry channel through ObdReader's PID readers, which is a bigger surface than this bugfix's scope - worth its own story once there's a real corrupted-payload sample to design against (same "chưa có fixture thật" pattern used elsewhere in this codebase).

- source_spec: none
  summary: Coolant/oil temperature plausible-range caps at 150°C, which would null out a genuine critical-overheat reading above that (the exact moment the app most needs to surface the number).
  evidence: Blind Hunter review of the obd-resilience change (2026-07-14). Raising the cap to the encodable ceiling (215°C) would make the check a no-op for temperature (same issue already accepted for PID 0B/0D); the current diagnosticRulesStore overheat rules already fire well below 150°C, so real-world impact is low - revisit with real overheat fixture data before changing the bound either way.

- source_spec: none
  summary: obdLiveMonitor's new vehicleUnresponsiveListeners set is never cleared in stop(), matching the pre-existing pattern of snapshotListeners/dtcListeners/findingListeners in the same file.
  evidence: Blind Hunter review of the obd-resilience change (2026-07-14). Not a regression introduced by this change - it follows the file's established (also unaddressed) listener-lifecycle pattern; fixing it should be done for all four listener sets together, not just the new one.

- source_spec: none
  summary: background_gap_seconds_total has no defense against clock anomalies (NTP sync, DST, manual clock change) producing a spuriously large forward Date.now() jump that gets misattributed as an app-backgrounding gap.
  evidence: Blind Hunter review of the obd-resilience change (2026-07-14). React Native has no cross-platform monotonic clock equivalent readily available; a real fix needs either a native monotonic-time bridge or accepting the ambiguity - low priority since clock jumps of this magnitude are rare compared to the backgrounding scenario this was built for.

- source_spec: none
  summary: onVehicleUnresponsive has no debounce/rate-limit; an ECU flickering exactly on 3-poll boundaries (null×3, valid, null×3, valid...) would fire the notification repeatedly.
  evidence: Blind Hunter review of the obd-resilience change (2026-07-14). Real-world frequency of this exact flapping pattern is unknown without field data; adding debounce now would be speculative tuning - revisit if a real session log shows this pattern causing notification spam.
