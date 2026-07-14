---
title: 'OBD session resilience against background-freeze data gaps (fixture #5)'
type: 'bugfix'
created: '2026-07-14'
status: 'done'
review_loop_iteration: 0
context: []
route: 'one-shot'
---

## Intent

**Problem:** `obd-fixtures/vgate-honda-city-20260713-05.json` exposed three gaps in `obdLiveMonitor`/`ObdReader`: background-freeze gaps between polls (144s/1700s/980s) were never recorded, a vehicle that stops responding (all PIDs `NO DATA`) was polled forever with no signal to the UI, and decoded sensor values were trusted with no physical-plausibility check.

**Approach:** Track wall-clock gaps between polls via `Date.now()` and surface them in the session summary; count consecutive all-null polls and fire a new `onVehicleUnresponsive` listener past a threshold (without touching the BLE connection); add a pure range-check (`isPlausibleValue`) in `obdParser.ts` applied to every decoder in `ObdReader.ts`.

## Suggested Review Order

**Gap detection (background-freeze telemetry)**

- Entry point: wall-clock gap measured against the previous poll, independent of the (possibly frozen) timer.
  [`obdLiveMonitor.ts:157-168`](../../src/services/obd/obdLiveMonitor.ts#L157-L168)

- Thresholds and rationale for why 15s/3 polls were chosen.
  [`obdLiveMonitor.ts:29-39`](../../src/services/obd/obdLiveMonitor.ts#L29-L39)

- Gap stats exposed in the end-of-session summary for trend analysis/QA.
  [`obdLiveMonitor.ts:126-130`](../../src/services/obd/obdLiveMonitor.ts#L126-L130)

**Vehicle-unresponsive detector**

- Consecutive all-null check and single-fire notification (deliberately excludes fuel/oil-temp PIDs).
  [`obdLiveMonitor.ts:173-188`](../../src/services/obd/obdLiveMonitor.ts#L173-L188)

- New public listener surface for UI consumption.
  [`obdLiveMonitor.ts:302-306`](../../src/services/obd/obdLiveMonitor.ts#L302-L306)

**Sensor plausibility range-check**

- Range table + pure check function, PID-agnostic and BLE-independent.
  [`obdParser.ts:205-241`](../../src/services/obd/obdParser.ts#L205-L241)

- Applied to every PID decoder (`readRpm` shown; same pattern repeats for all 13 readers).
  [`ObdReader.ts:107-111`](../../src/services/obd/ObdReader.ts#L107-L111)

**Tests**

- Gap-detection and vehicle-unresponsive behaviors, including threshold boundary and unsubscribe.
  [`obdLiveMonitorResilience.test.ts`](../../src/services/obd/__tests__/obdLiveMonitorResilience.test.ts#L1)

- Plausibility-check unit tests plus a registry/range-table sync guard.
  [`obdParser.test.ts:192`](../../src/services/obd/__tests__/obdParser.test.ts#L192)

**Deferred (see `deferred-work.md`)**

- Pre-existing broken `obdFlow.test.ts` (deleted fixture, unrelated to this change), the null-reason ambiguity between "unsupported" and "implausible" feeding the unresponsive detector, the 150°C temperature cap trade-off, listener cleanup on `stop()`, clock-anomaly false positives, and unresponsive-notification debounce.
