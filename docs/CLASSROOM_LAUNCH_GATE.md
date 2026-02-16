# Classroom Launch Gate Report

**Date:** 2026-02-16  
**Auditor:** Automated release-gate audit  
**Branch:** `main` @ `a5405a2` (up to date with `origin/main`)  
**Target Audience:** 10–11 year olds, ~20 Arduino Nano 33 BLE boards  
**Core Flow:** Collect → Train → Upload via BLE → On-device Test

---

## A) DECISION

# ✅ GO

---

## B) BLOCKERS

**No classroom-launch blockers found.**

All four hard pass/fail criteria pass:

### 1. BLE Deploy Reliability ✅

| Check                        | Result   | Evidence                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload size parity          | **PASS** | Web-app `weightsToBytes()` produces 78,128 bytes (`modelExportService.ts:207-213`). Firmware `sizeof(SimpleNNModel)` = 78,128 bytes (verified via struct layout in `simple_nn.h:53-69`). Exact match.                                                                                                                                                                            |
| CRC32 algorithm parity       | **PASS** | Both use IEEE 802.3 polynomial `0xEDB88320`, init `0xFFFFFFFF`, final XOR `0xFFFFFFFF`. Firmware self-test (`flash_storage.cpp:98-103`) validates `CRC32("hello") == 0x3610A686`. Web-app table (`modelExportService.ts:294-301`) uses identical polynomial. Python `binascii.crc32(b"hello")` confirms `0x3610A686`.                                                            |
| Chunk protocol alignment     | **PASS** | Web-app sends START `[cmd=0x01, size(4), crc32(4), numClasses(1), labels...]` (`bleModelUploadService.ts:228-263`). Firmware expects identical layout (`main.cpp:203-252`). Chunk command matches: `[cmd=0x02, offset(4), data(N)]` (`bleModelUploadService.ts:266-281` / `main.cpp:255-270`).                                                                                   |
| Out-of-order chunk rejection | **PASS** | Firmware enforces strictly sequential chunks (`flash_storage.cpp:191-198`). Web-app sends sequentially (`bleModelUploadService.ts:156-180`).                                                                                                                                                                                                                                     |
| Multi-class support (2/3/4)  | **PASS** | `weightsToBytes()` zero-pads output weights to `NN_MAX_CLASSES * NN_HIDDEN_SIZE` and output biases to `NN_MAX_CLASSES` (`modelExportService.ts:249-250`), producing a fixed-size struct regardless of actual class count (2–8). Header encodes actual `numClasses` (`modelExportService.ts:243`). Firmware validates `numClasses ∈ [1, NN_MAX_CLASSES]` (`simple_nn.cpp:64-69`). |
| Single-gesture mode          | **PASS** | Training service auto-adds synthetic "Idle" class for single-gesture (`trainingService.ts:184-235`). Upload includes "Idle" label (`TrainPage.tsx:131-133`). Result: 2-class model.                                                                                                                                                                                              |
| Status check interval        | **PASS** | Web-app checks status every 50 chunks during upload (`bleModelUploadService.ts:169-177`). Fails fast on status ≥ 10 (error codes).                                                                                                                                                                                                                                               |
| Size validation on firmware  | **PASS** | `beginModelUpload()` rejects if `totalSize != sizeof(uploadBuffer)` (`flash_storage.cpp:150-157`). Web-app computes exact struct size (`modelExportService.ts:207-213`).                                                                                                                                                                                                         |

**Hardware-dependent check:** Repeated BLE uploads under RF contention with ~20 boards — **UNVERIFIABLE IN SOFTWARE AUDIT**. Marked unverified but no code-level blocker exists. The protocol has sequential chunk enforcement, CRC validation, and mid-upload status checks which provide strong reliability guarantees.

### 2. Model-Loaded Integrity ✅

| Check                                    | Result   | Evidence                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TestPage gates on no model               | **PASS** | `TestPage.tsx:77-84`: On "Start Testing" click, reads `deviceInfo` via `ble.getDeviceInfo()`, checks `!info.hasModel \|\| info.storedModelSize === 0`, and shows clear error message: _"No trained model is on the Arduino. Go back to Train and tap 'Upload via Bluetooth' first."_                                                                     |
| Firmware reports model status correctly  | **PASS** | `main.cpp:164`: `info[20] = hasStoredModel() ? 1 : 0`. `flash_storage.cpp:115-117`: `hasStoredModel()` checks both `hasModel` flag AND `storedModel.magic == SIMPLE_NN_MAGIC`.                                                                                                                                                                           |
| No persistent fallback after upload      | **PASS** | After successful upload, `main.cpp:284-287` calls `reloadModel()` which loads into `neuralNetwork` (`inference.cpp:120-147`). Once `neuralNetwork.isModelLoaded()` returns true, inference skips the fallback block (`inference.cpp:198-202`) and runs real NN math. `reloadModel()` failure triggers status error back to web app (`main.cpp:288-290`). |
| Fallback produces 50% class-0 (harmless) | **PASS** | `inference.cpp:200-201`: when no model loaded, returns `prediction=0, confidence=0.50f`. This only runs if `neuralNetwork.isModelLoaded()` is false, which only occurs when no model has been uploaded (or upload failed). The TestPage gate prevents students from entering test mode in this state.                                                    |

### 3. Inference Usability for Kids ✅

| Check                                         | Result   | Evidence                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student knows what to do                      | **PASS** | TestPage shows "Target now: **[gesture name]**" (`TestPage.tsx:309`), in-page instruction box says "Keep the board steady, do one clear gesture, then tap Score Attempt" (`TestPage.tsx:313`), and Tips section gives 4 clear bullet points (`TestPage.tsx:424-449`).                                                                             |
| Prediction is visible and clear               | **PASS** | Large 6xl/7xl font prediction label (`TestPage.tsx:283-284`), plus color-coded confidence dot and bar (green >70%, amber >40%, red below) (`TestPage.tsx:288-306`). Numeric confidence shown as `XX.X% Confident` (`TestPage.tsx:293`).                                                                                                           |
| Training accuracy not misrepresented          | **PASS** | TrainPage shows accuracy as "Model Accuracy" (`TrainPage.tsx:334`) — an accurate label. Challenge scoring on TestPage (`TestPage.tsx:353-420`) is clearly labeled "Challenge (10 Turns)" with a separate "Challenge accuracy" metric, which represents actual test performance, not training accuracy. These are visually distinct presentations. |
| Test feedback understandable for facilitation | **PASS** | The 10-turn challenge scoring system provides a concrete, gamified metric kids can understand (`TestPage.tsx:146-217`). "Score Attempt" → ✓/✗ per turn, running score displayed as `X/10`, progress bar, and completion message.                                                                                                                  |
| Challenge mode for classroom engagement       | **PASS** | `TestPage.tsx:30-31`: `CHALLENGE_ATTEMPTS = 10`, with weighted scoring window. Guided prompts rotate through all gesture classes.                                                                                                                                                                                                                 |

### 4. Runtime Stability ✅

| Check                      | Result   | Evidence                                                                                                                                                                                                                                                                                           |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript compilation     | **PASS** | `npx tsc --noEmit` — zero errors.                                                                                                                                                                                                                                                                  |
| Production build           | **PASS** | `npm run build` — completes successfully. Output: `dist/index.html`, `dist/assets/index-*.css` (45 KB), `dist/assets/index-*.js` (1,138 KB).                                                                                                                                                       |
| No mode-switch deadlock    | **PASS** | Upload pauses sensor sampling (`main.cpp:442-445`: `if (getUploadState() == UPLOAD_RECEIVING) { delay(1); continue; }`), preventing BLE contention. Mode transitions are single-byte writes (`bleService.ts:130-138`). Cleanup on TestPage unmount stops both stream types (`TestPage.tsx:54-60`). |
| BLE reconnect debounce     | **PASS** | `main.cpp:410-412`: 500ms debounce on reconnections (`RECONNECT_DEBOUNCE_MS`).                                                                                                                                                                                                                     |
| Disconnect handler cleanup | **PASS** | `bleService.ts:84-95`: Nulls all characteristic references on disconnect. `TestPage.tsx:54-60`: Cleanup via `useEffect` return stops inference/sensor stream.                                                                                                                                      |
| No test suite regressions  | **N/A**  | No test runner configured (`npm test` → "Missing script"). Existing test files (`bleParser.test.ts`, `modelExportService.test.ts`, `trainingService.test.ts`) are present but not wired to a runner. This is a non-blocking gap — see residual risks.                                              |

---

## C) GO-LIVE CHECKLIST

Since no blockers were found, this section lists **pre-deployment hardware verification checks** that should be performed before the classroom session:

| #   | Check                                          | Pass Criteria                                                          | Status |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| 1   | Flash firmware to all 20 boards                | All boards boot, serial output shows "Severn Edge AI v1.1 ... Ready!"  | Manual |
| 2   | Each board advertises with correct BLE name    | `SevernEdgeAI-N` for mapped boards, `SevernEdgeAI-XXXX` for unmapped   | Manual |
| 3   | Web app connects to a board                    | ConnectPage transitions to CollectPage with green dot and device info  | Manual |
| 4   | Record 3+ samples per gesture (2-class)        | CollectPage shows progress, quality ≥ 30 accepted                      | Manual |
| 5   | Train model (2-class)                          | TrainPage shows accuracy ≥ 60% within 50 epochs                        | Manual |
| 6   | Upload model via BLE                           | Progress bar reaches 100%, status shows "Model deployed!"              | Manual |
| 7   | TestPage starts on-device inference            | Predictions appear with gesture labels and confidence                  | Manual |
| 8   | Repeat upload test (3-class and 4-class)       | Same pass criteria as #6                                               | Manual |
| 9   | Power-cycle board, reconnect, re-upload        | Upload succeeds (RAM-based storage means model is lost on power cycle) | Manual |
| 10  | Verify no stale CRC/status 11 across 3 uploads | All uploads complete with STATUS_SUCCESS (0x04)                        | Manual |

---

## D) NO BLOCKERS FOUND

### Residual Risks (non-blocking)

1. **RAM-only model storage:** Models are lost on power cycle (`flash_storage.cpp:9-10`). If a student's Arduino loses power during the session, they must re-upload. Mitigation: ensure USB cables are secure.

2. **No automated test suite:** Test files exist but no runner is configured. A regression in `bleParser`, `modelExportService`, or `trainingService` would go undetected until runtime. Low risk for a static deployment with no planned code changes before launch.

3. **Large JS bundle (1.1 MB):** TensorFlow.js dominates bundle size. On slow classroom WiFi/hotspot, initial page load may take 5–10 seconds. Mitigation: pre-load the web app URL on all student Chromebooks before the session starts.

---

## Appendix: Verified Constant Parity

| Constant          | Web App (`constants.ts`) | Firmware (`config.h` / `simple_nn.h`) | Match                 |
| ----------------- | ------------------------ | ------------------------------------- | --------------------- |
| `NN_INPUT_SIZE`   | 600                      | 600                                   | ✅                    |
| `NN_HIDDEN_SIZE`  | 32                       | 32                                    | ✅                    |
| `NN_MAX_CLASSES`  | 8                        | 8                                     | ✅                    |
| `LABEL_MAX_LEN`   | 16                       | 16                                    | ✅                    |
| `SIMPLE_NN_MAGIC` | `0x4E4E4E53`             | `0x4E4E4E53`                          | ✅                    |
| `WINDOW_SIZE`     | 100                      | 100                                   | ✅                    |
| `WINDOW_STRIDE`   | 5                        | 5                                     | ✅                    |
| `ACCEL_SCALE`     | 8192.0                   | 8192.0f                               | ✅                    |
| `GYRO_SCALE`      | 16.4                     | 16.4f                                 | ✅                    |
| `NORM_ACCEL`      | 4.0                      | 4.0f                                  | ✅                    |
| `NORM_GYRO`       | 500.0                    | 500.0f                                | ✅                    |
| `SERVICE_UUID`    | `19b10000-...`           | `19B10000-...`                        | ✅ (case-insensitive) |
| Payload size      | 78,128 bytes             | 78,128 bytes                          | ✅                    |
| CRC32 polynomial  | IEEE 802.3               | IEEE 802.3                            | ✅                    |
