# Severn Edge AI - Complete Implementation Specification (v2)

Purpose: This is the implementation source of truth for Severn Edge AI v2. It is explicitly aligned to the current repository and addresses key risks identified in prior review.

Status: Draft for implementation
Date: 2026-02-21

## 1. What Changed From v1

v2 keeps the strong parts of v1 (classroom pain points, M1 -> M2 -> M3 sequencing), and fixes high-risk gaps:

1. Adds explicit migration from current codebase instead of "greenfield" assumptions.
2. Freezes BLE protocol to current firmware/web constants and packet contracts.
3. Replaces unsafe reconnect assumptions with platform-aware reconnect behavior.
4. Reworks persistence to avoid whole-session rewrites and stale overwrite races.
5. Resolves router mismatch by keeping stage-state navigation for now.
6. Expands testing from placeholders to concrete automated + manual coverage.
7. Adds data privacy/retention controls for shared classroom devices.

## 2. Non-Negotiable Compatibility Baseline

This section is authoritative. Any implementation that violates these contracts is out of scope.

### 2.1 Current Navigation Architecture

Keep current stage-based navigation in `web-app/src/App.tsx` for M1/M2.

- No `react-router-dom` introduction in M1/M2.
- Optional router migration may be revisited in M3 only if a separate RFC is approved.

### 2.2 BLE UUID and Protocol Contracts

Use existing BLE constants from `web-app/src/config/constants.ts` and `firmware/src/config.h`.

- Service: `19b10000-e8f2-537e-4f6c-d104768a1214`
- Mode: `...0001`
- Sensor: `...0002`
- Inference: `...0003`
- DeviceInfo: `...0004`
- Config: `...0005`
- ModelUpload: `...0006`
- ModelStatus: `...0007`

Do not replace with simplified 3-characteristic examples.

### 2.3 Model Upload Framing (Must Stay Command-Based)

Keep command framing used by firmware:

- `START (0x01)`: size + crc + numClasses + labels
- `CHUNK (0x02)`: offset + data
- `COMPLETE (0x03)`
- `CANCEL (0x04)`

Retry logic must wrap this protocol, not replace it with raw `[offset][data]`.

### 2.4 Type Compatibility

Current application types remain canonical for M1:

- `Sample.data: number[][]`
- `GestureLabel.sampleCount: number`
- `AppStage` enum in `web-app/src/types/index.ts`

If new fields are needed, add backward-compatible fields rather than replacing existing ones.

## 3. Problem Statement (Unchanged)

Validated classroom problems:

1. Silent disconnects and weak recovery UX.
2. Refresh can lose valuable student work.
3. Students can rush through conceptual checkpoints.
4. Weak sense of ownership/project identity.
5. Weak artifact/share outcome for family showcase.

## 4. Architecture Decisions (v2)

### Decision A: Incremental Migration, Not Rewrite

Implement v2 by extending current architecture:

1. Add stores/services behind existing page interfaces first.
2. Keep current page flow operational while persistence/reconnect lands.
3. Only refactor page ownership/state boundaries after behavior is stable.

### Decision B: Reconnect Is Best-Effort + Fast User Fallback

Web Bluetooth reconnect reliability differs by platform/browser state. Therefore:

1. Attempt short silent reconnect first.
2. If not recovered quickly, present explicit "Choose Device" CTA.
3. Do not spend long dead time on hidden retries.

### Decision C: Persistence Must Be Write-Safe

Avoid stale write races from mixed immediate/debounced whole-session writes.

Use:

1. Normalized stores (metadata separate from sample payloads).
2. Serialized write queue.
3. Monotonic `revision` on session metadata.

### Decision D: Shared Device Safety

Recovery must not auto-load another student's work without confirmation.

## 5. Data Model (v2)

## 5.1 Type Strategy

Keep app runtime types unchanged for M1:

```ts
interface GestureLabel {
  id: string;
  name: string;
  sampleCount: number;
}

interface Sample {
  id: string;
  label: string;
  data: number[][];
  timestamp: number;
  quality: number;
}
```

Add persistence-specific metadata types instead of replacing runtime types.

## 5.2 IndexedDB Schema

Database name: `severn-edge-ai`  
Database version: `2`

Object stores:

1. `sessions` (key: `sessionId`)
2. `samples` (key: `sampleId`, index: `sessionId`, index: `labelId`)
3. `journals` (key: `entryId`, index: `sessionId`)

`sessions` contains lightweight metadata:

- `sessionId`
- `revision`
- `createdAt`
- `updatedAt`
- `studentDisplayName` (optional)
- `projectBrief` (optional)
- `gestures`
- `badgeIds`
- `checkpointIds`
- `currentStage`
- `trainingAccuracy`
- `lastDeviceName`

`samples` contains each sample payload independently:

- `sampleId`
- `sessionId`
- `labelId`
- `data: number[][]`
- `quality`
- `timestamp`

## 5.3 Upgrade Path

DB upgrade handler requirements:

1. If old monolithic store exists, migrate records into `sessions` + `samples`.
2. Preserve old `Sample` structure (`number[][]`).
3. Stamp migrated records with `revision = 1`.

## 6. Connection & Reconnect (M1)

### 6.1 Connection Store

Use a store for UI state, but do not cache `getState()` once at class construction.

Rule:

- Read state via `useConnectionStore.getState()` at point-of-use.

### 6.2 Reconnect Behavior

On `gattserverdisconnected`:

1. If user-triggered disconnect flag is set, stop.
2. Enter `reconnecting` state.
3. Try silent reconnect with bounded budget:
   - attempt 1 after 500 ms
   - attempt 2 after 1500 ms
4. If still failing, immediately show chooser modal with explicit CTA.

Rationale: minimize dead-time on classroom Chromebooks.

### 6.3 Rehydrate Idempotently

Reconnect path must:

1. Reconnect GATT.
2. Re-fetch service + characteristics.
3. Re-subscribe notifications exactly once.

Before re-subscribing, remove old listeners if present.

### 6.4 UI Requirements

Add:

1. `ConnectionStatusPill`
2. `ReconnectModal`
3. Explicit user messaging by state (`connecting`, `reconnecting`, `needs-user-action`).

## 7. Model Upload Reliability (M1)

Enhance existing `bleModelUploadService.ts` without protocol changes:

1. Keep `START/CHUNK/COMPLETE/CANCEL`.
2. Per-chunk retry with bounded attempts.
3. Mid-upload status checks via `MODEL_STATUS`.
4. Fail fast on firmware error status codes.
5. Always send `CANCEL` on terminal failure.

Do not introduce alternate packet formats.

## 8. Persistence UX (M1)

### 8.1 Recovery Banner

On startup, show recoverable sessions sorted by `updatedAt` (descending), not auto-open most recent blindly.

UI:

1. Session card list (timestamp + sample count + project name if present).
2. `Continue`, `Start Fresh`, `Not Mine` actions.

### 8.2 Shared Device Controls

Add in Settings/Footer:

1. `Clear this device's Severn Edge AI data`.
2. Confirmation modal with irreversible warning.

## 9. Learning Outcomes (M2)

### 9.1 Knowledge Gates

Minimum gates:

1. Preview -> Collect (sensor concept)
2. Collect -> Train (gesture separability)
3. Train -> Deploy/Test (confidence + data quality interpretation)

### 9.2 Teacher Override

Keep override capability, but make it explicit and auditable:

1. Teacher mode toggle or protected unlock path.
2. Persist `overrideUsedAt` event in session metadata.

### 9.3 Badge Visibility

Add persistent `BadgeTray` in M2 (not deferred to M3).

### 9.4 Idle Class Clarification

If auto-idle is used, define exact behavior:

1. How idle samples are generated.
2. Label index/order implications.
3. Export/upload compatibility impact.

If not implemented in M2, remove "automatic idle class" claim from UI.

## 10. PBL + Showcase (M3)

### 10.1 Project Brief + Journal

Implement with explicit entry points in flow, not just schema:

1. Project Brief before Preview/Collect.
2. Journal prompt after first training run and after test session.

### 10.2 Portfolio Export

Keep browser-based self-contained HTML export.

Requirements:

1. Escape all user fields.
2. Mobile + print-friendly layout.
3. Include date, project info, gestures, badges, reflections.
4. Provide anonymized export option (omit student name).

## 11. Testing Requirements (Concrete)

## 11.1 Automated Tests

Unit:

1. `connectionStore` transitions
2. reconnect decision logic (user disconnect vs transport disconnect)
3. IndexedDB migration v1 -> v2
4. write queue ordering and revision monotonicity
5. upload retry/backoff behavior with mocked characteristic failures

Integration:

1. fake IndexedDB recovery list and resume flow
2. BLE mock for disconnect/reconnect rehydrate path
3. duplicate-listener prevention test

## 11.2 Manual Classroom Scenarios

1. Refresh during data collection and recovery success.
2. USB unplug/replug during collect and during upload.
3. Shared Chromebook handoff:
   - student A work exists
   - student B starts app
   - verify non-owner safe flow.
4. Low-quality data path and gate behavior.
5. Portfolio export open + print on phone and laptop.

## 11.3 Platform Matrix

Minimum manual verification:

1. Chromebook Chrome (primary)
2. macOS Chrome (dev)

## 12. Delivery Plan

### M1 (Stability) Exit Criteria

1. No silent failure path on disconnect.
2. Reconnect fallback visible within 2 seconds of failed silent reconnect.
3. Student samples survive refresh and browser restart.
4. No stale overwrite races in persistence under rapid updates.
5. Upload failure surfaces actionable error message and recovery action.

### M2 (Learning) Exit Criteria

1. Three knowledge gates working with teacher override logging.
2. Badge progress visible throughout workflow.
3. Data quality feedback influences behavior (measured in pilot notes).

### M3 (Showcase) Exit Criteria

1. Project brief and journal integrated in student flow.
2. Portfolio export works offline and prints cleanly.
3. Family-share pathway is clear and tested.

## 13. Explicit Non-Goals for v2

1. Full router migration.
2. Backend/cloud account system.
3. Replacing current BLE protocol.
4. Replacing runtime app types with incompatible schema.

## 14. Implementation Order

1. Protocol/constant freeze tests.
2. Connection store + reconnect controller.
3. IndexedDB v2 schema + migration + queue.
4. Recovery UI with shared-device safety.
5. Upload retry improvements on existing protocol.
6. M2 learning gates + badge tray.
7. M3 brief/journal/portfolio.

---

End of v2 specification.
