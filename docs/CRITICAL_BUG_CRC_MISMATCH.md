# CRITICAL BUG: Model Upload CRC Mismatch (Status Code 11)

**Date**: February 14, 2026  
**Severity**: CRITICAL — Blocks the core product feature (deploying trained models to Arduino)  
**Status**: UNRESOLVED after multiple fix attempts

---

## 1. Problem Statement

When a user trains a gesture-recognition model in the web app and uploads it to the Arduino Nano 33 BLE via Bluetooth, the upload consistently fails with **status code 11** (`STATUS_ERROR_CRC`).

This means the CRC32 checksum the web app calculates over the model bytes **does not match** the CRC32 the Arduino calculates over the bytes it received.

**The training pipeline, BLE connection, and data collection all work correctly. Only the model upload fails.**

---

## 2. System Architecture Overview

```
┌─────────────────────┐     BLE (Bluetooth Low Energy)     ┌──────────────────────┐
│     Web App          │ ──────────────────────────────────▶│  Arduino Nano 33 BLE │
│  (Chrome Browser)    │                                    │  (nRF52840 MCU)      │
│                      │   1. START cmd (size, CRC, labels) │                      │
│  TensorFlow.js       │   2. CHUNK cmds (offset + data)    │  SimpleNN Inference  │
│  Model Training      │   3. COMPLETE cmd                  │  Engine              │
│                      │                                    │                      │
│  modelExportService  │   Status reads ◀──────────────     │  flash_storage.cpp   │
│  bleModelUploadSvc   │                                    │  (CRC verification)  │
└─────────────────────┘                                    └──────────────────────┘
```

### Upload Protocol

1. **START** (`0x01`): Web app sends `[cmd(1), modelSize(4), crc32(4), numClasses(1), labels...]`
2. **CHUNK** (`0x02`): Web app sends `[cmd(1), offset(4), data(up to 195 bytes)]` — repeated ~396 times for a ~77KB model
3. **COMPLETE** (`0x03`): Web app sends `[cmd(1)]`
4. Arduino receives COMPLETE → calls `finalizeModelUpload(expectedCrc32)` → calculates CRC32 over received buffer → compares with expected → returns `STATUS_ERROR_CRC` (11) if mismatch

---

## 3. Key Files

| File                                            | Role                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `firmware/src/flash_storage.cpp`                | Receives chunks into `uploadBuffer`, calculates CRC32 on finalize        |
| `firmware/src/flash_storage.h`                  | Defines `UploadStatus` enum (STATUS_ERROR_CRC = 11)                      |
| `firmware/src/simple_nn.h`                      | Defines `SimpleNNModel` struct (the target data format)                  |
| `firmware/src/main.cpp`                         | Main loop, handles BLE writes via `handleModelUpload()`                  |
| `firmware/src/config.h`                         | Constants: `NN_INPUT_SIZE=600`, `NN_HIDDEN_SIZE=32`, `NN_MAX_CLASSES=8`  |
| `web-app/src/services/modelExportService.ts`    | Extracts weights from TF.js model, serializes to bytes, calculates CRC32 |
| `web-app/src/services/bleModelUploadService.ts` | Orchestrates BLE upload: START → CHUNKs → COMPLETE                       |
| `web-app/src/config/constants.ts`               | Web app constants (must mirror firmware config.h)                        |

---

## 4. CRC32 Implementation Comparison

### Firmware (`flash_storage.cpp`, line ~82)

```c
uint32_t calculateCrc32(const uint8_t* data, size_t length) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < length; i++) {
        crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    }
    return crc ^ 0xFFFFFFFF;
}
```

### Web App (`modelExportService.ts`, line ~327)

```typescript
export function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
```

**Both use the same IEEE 802.3 CRC32 algorithm.** The lookup tables were visually verified to match. Unit tests confirm the web app's CRC32 produces `0xCBF43926` for "123456789" and `0x00000000` for empty input — both correct.

---

## 5. Firmware Upload Buffer Details

### `flash_storage.cpp` (lines 22-31)

```c
static uint8_t uploadBuffer[sizeof(SimpleNNModel)];
static UploadState currentUploadState = UPLOAD_IDLE;
static size_t bytesReceived = 0;
static size_t expectedSize = 0;
static uint32_t expectedCrc32 = 0;
static uint8_t uploadNumClasses = 0;
static char uploadLabels[NN_MAX_CLASSES][LABEL_MAX_LEN];
```

### `SimpleNNModel` struct (`simple_nn.h`, lines 53-69)

```c
struct SimpleNNModel {
    uint32_t magic;                                          // 4 bytes
    uint32_t numClasses;                                     // 4 bytes
    uint32_t inputSize;                                      // 4 bytes
    uint32_t hiddenSize;                                     // 4 bytes
    float hiddenWeights[NN_HIDDEN_SIZE][NN_INPUT_SIZE];      // 32 * 600 * 4 = 76,800 bytes
    float hiddenBias[NN_HIDDEN_SIZE];                        // 32 * 4 = 128 bytes
    float outputWeights[NN_MAX_CLASSES][NN_HIDDEN_SIZE];     // 8 * 32 * 4 = 1,024 bytes
    float outputBias[NN_MAX_CLASSES];                        // 8 * 4 = 32 bytes
    char labels[NN_MAX_CLASSES][LABEL_MAX_LEN];              // 8 * 16 = 128 bytes
};
// Total sizeof(SimpleNNModel) ≈ 78,128 bytes
```

### `finalizeModelUpload()` (lines 216-242)

```c
UploadStatus finalizeModelUpload(uint32_t expectedCrc32) {
    // Check size
    if (bytesReceived != expectedSize) {
        return STATUS_ERROR_SIZE;  // code 10
    }

    // Calculate CRC over received bytes
    uint32_t actualCrc = calculateCrc32(uploadBuffer, bytesReceived);

    if (actualCrc != expectedCrc32) {
        return STATUS_ERROR_CRC;  // code 11 ← THIS IS WHAT FIRES
    }
    // ... save to flash ...
}
```

---

## 6. Web App Serialization — `weightsToBytes()`

### `modelExportService.ts` — `weightsToBytes()` function

```typescript
function weightsToBytes(weights: SimpleNNWeights): Uint8Array {
  const totalFloats =
    weights.hiddenWeights.length + // hiddenSize * inputSize
    weights.hiddenBiases.length + // hiddenSize
    weights.outputWeights.length + // numClasses * hiddenSize
    weights.outputBiases.length; // numClasses

  const buffer = new ArrayBuffer(totalFloats * 4);
  const view = new DataView(buffer);
  let offset = 0;

  // Hidden weights: [hiddenSize][inputSize] - already transposed
  for (let i = 0; i < weights.hiddenWeights.length; i++) {
    view.setFloat32(offset, weights.hiddenWeights[i], true); // little-endian
    offset += 4;
  }
  // Hidden biases
  for (let i = 0; i < weights.hiddenBiases.length; i++) {
    view.setFloat32(offset, weights.hiddenBiases[i], true);
    offset += 4;
  }
  // Output weights: [numClasses][hiddenSize] - already transposed
  for (let i = 0; i < weights.outputWeights.length; i++) {
    view.setFloat32(offset, weights.outputWeights[i], true);
    offset += 4;
  }
  // Output biases
  for (let i = 0; i < weights.outputBiases.length; i++) {
    view.setFloat32(offset, weights.outputBiases[i], true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}
```

---

## 7. ⚠️ CRITICAL SUSPICION: Structural Mismatch Between Web App and Firmware

### What the web app sends (via `weightsToBytes`):

```
[hiddenWeights (76,800 B)] [hiddenBiases (128 B)] [outputWeights (N*128 B)] [outputBiases (N*4 B)]
```

**Total for 2 classes**: 76,800 + 128 + 256 + 8 = **77,192 bytes**

### What the firmware's `uploadBuffer` expects (`SimpleNNModel` struct layout):

```
[magic (4B)] [numClasses (4B)] [inputSize (4B)] [hiddenSize (4B)]
[hiddenWeights (76,800 B)] [hiddenBias (128 B)]
[outputWeights (1,024 B)] [outputBias (32 B)]    ← FIXED SIZE (NN_MAX_CLASSES=8, not numClasses!)
[labels (128 B)]
```

**Total**: 78,128 bytes (always, regardless of numClasses)

### ⚠️ THE MISMATCH:

1. **The web app sends ONLY the weight data** — no magic, numClasses, inputSize, hiddenSize, or labels fields. But the firmware copies received bytes into `uploadBuffer` which IS a `SimpleNNModel`. The CRC is calculated over the raw buffer bytes (`uploadBuffer`), not over a properly structured model. **If the web app sends 77,192 bytes but the firmware expects them to fill a 78,128-byte struct, the buffer layout won't match.**

2. **Output weight/bias arrays are VARIABLE size in web app but FIXED size in firmware.** The web app sends `numClasses * hiddenSize` output weights (e.g., 2 _ 32 = 64 floats for 2 classes), but the firmware struct has `NN_MAX_CLASSES _ NN_HIDDEN_SIZE` = 8 \* 32 = 256 floats allocated. This means the data layout in the buffer doesn't align with what the web app sent.

3. **The CRC is computed over different data on each side:**
   - Web app: CRC32 of `weightsToBytes()` output = just the weight data, tightly packed
   - Firmware: CRC32 of `uploadBuffer` = raw bytes received, but `uploadBuffer` is `sizeof(SimpleNNModel)` which includes padding, metadata fields, etc.

**This structural mismatch is the most likely root cause and was NOT addressed by the timing fixes.**

---

## 8. Fix Attempts Made (All Failed to Resolve Status 11)

### Attempt 1: Increase BLE Chunk Delay (Web App)

- **File**: `bleModelUploadService.ts`
- **Change**: Increased inter-chunk delay from 50ms → 100ms
- **Rationale**: Suspected firmware was missing BLE writes because main loop was too slow
- **Result**: ❌ Status code 11 still occurs

### Attempt 2: Skip Sensor Sampling During Upload (Firmware)

- **File**: `main.cpp`
- **Change**: Added `if (getUploadState() == UPLOAD_RECEIVING) { delay(1); continue; }` to skip sensor reads during upload
- **Rationale**: Sensor reads take up to 40ms, reducing main loop frequency and potentially causing missed BLE writes
- **Result**: ❌ Status code 11 still occurs

### Attempt 3: Add Status Verification After START Command (Web App)

- **File**: `bleModelUploadService.ts`
- **Change**: Read status after START command to verify acceptance; periodic status checks every 50 chunks
- **Rationale**: Detect errors early rather than only after all data is sent
- **Result**: ❌ The START command is accepted (no early error), but final CRC still fails

### Attempt 4: Increase START Command Delay (Web App)

- **File**: `bleModelUploadService.ts`
- **Change**: Increased post-START delay from 200ms → 300ms
- **Result**: ❌ Status code 11 still occurs

---

## 9. Other Fixes Made During This Session (Unrelated to CRC)

| Fix                           | File                 | Details                                                                       |
| ----------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| Missing `#include <stdint.h>` | `config.h`           | `DeviceMapping` struct used `uint16_t`/`uint8_t` without including the header |
| Missing semicolon             | `main.cpp` line 308  | `delay(1000)` was missing `;` causing a cryptic compile error                 |
| Single-gesture support        | `constants.ts`       | `MIN_GESTURES` changed from 2 → 1                                             |
| tf.oneHot depth error         | `trainingService.ts` | Auto-generates synthetic "Idle" class when only 1 gesture → 2-class model     |
| Single-gesture model creation | `TrainPage.tsx`      | `createUntrainedModel` now uses `Math.max(2, labels.length)`                  |
| Single-gesture upload labels  | `TrainPage.tsx`      | Appends "Idle" to label names for single-gesture uploads                      |

---

## 10. Assumptions Made During Debugging

1. **ASSUMED (likely wrong)**: The CRC mismatch was caused by BLE timing — chunks arriving faster than the firmware could process them, causing data loss. Evidence against: `writeValueWithResponse` guarantees delivery at the BLE protocol level, and the firmware passes the size check (STATUS_ERROR_SIZE = 10 is NOT triggered).

2. **ASSUMED (needs verification)**: The CRC32 lookup tables are identical on both sides. They were "visually verified" but a byte-for-byte comparison was not done programmatically.

3. **ASSUMED (likely wrong)**: The bytes the web app sends map directly to the `uploadBuffer` (which is `sizeof(SimpleNNModel)`). See Section 7 — the web app only sends weight data, not the full struct. **This assumption needs the most scrutiny.**

4. **ASSUMED (needs verification)**: The firmware's `receiveModelChunk()` function writes bytes at the correct offsets without off-by-one errors or buffer misalignment.

5. **ASSUMED**: Little-endian byte order is consistent between the nRF52840 (ARM Cortex-M4, little-endian) and `DataView.setFloat32(offset, value, true)` in JavaScript (`true` = little-endian). This should be correct but hasn't been independently verified.

---

## 11. Recommended Investigation Path

### Priority 1: Verify What Bytes Each Side is CRC'ing

Add debug logging:

**Firmware** — In `finalizeModelUpload()`, print:

```c
Serial.print("Bytes received: "); Serial.println(bytesReceived);
Serial.print("Expected CRC: 0x"); Serial.println(expectedCrc32, HEX);
Serial.print("Actual CRC:   0x"); Serial.println(actualCrc, HEX);
Serial.print("First 16 bytes: ");
for (int i = 0; i < 16; i++) { Serial.print(uploadBuffer[i], HEX); Serial.print(" "); }
Serial.println();
```

**Web App** — In `uploadModel()`, print:

```typescript
console.log(
  "First 16 bytes:",
  Array.from(modelData.slice(0, 16)).map((b) => b.toString(16)),
);
console.log("Total bytes:", modelData.length);
console.log("CRC32:", crc32.toString(16));
```

### Priority 2: Investigate the Structural Mismatch (Section 7)

The web app sends a tightly-packed weight array. The firmware's `uploadBuffer` is `sizeof(SimpleNNModel)`. These are NOT the same layout. The firmware may need to:

- Either: Accept raw weight bytes and reconstruct the model struct
- Or: The web app needs to send the ENTIRE `SimpleNNModel` struct (including magic, numClasses, padding, etc.)

### Priority 3: Examine `receiveModelChunk()` and `beginModelUpload()`

Check how `beginModelUpload()` initializes the buffer and how `receiveModelChunk()` copies data in. Verify:

- Is `memset(uploadBuffer, 0, sizeof(uploadBuffer))` called?
- Does `receiveModelChunk()` write to `uploadBuffer + offset` correctly?
- Is `expectedSize` set to the web app's `totalBytes` (weight-only) or `sizeof(SimpleNNModel)`?

### Priority 4: Byte-Level Comparison

Export the model as a `.h` file (web app has this feature) and compare the byte array in the header file with what the firmware receives. If the bytes match but CRC doesn't, the CRC implementation is wrong. If the bytes don't match, it's a transport issue.

---

## 12. Environment

| Component          | Details                                |
| ------------------ | -------------------------------------- |
| Arduino Board      | Nano 33 BLE (Rev2) — nRF52840 MCU      |
| Firmware Framework | Arduino Mbed OS, ArduinoBLE 1.5.0      |
| PlatformIO         | Core v6.1.18                           |
| Web Framework      | Vite 7.2.6 + React + TypeScript        |
| ML Framework       | TensorFlow.js (browser)                |
| Browser            | Chrome (macOS) with Web Bluetooth API  |
| BLE Protocol       | GATT Write With Response, 200-byte MTU |

---

## 13. Git State

- **Last clean commit**: `9f29407` — device naming + formatting (pushed to GitHub)
- **Uncommitted changes**: CRC fix attempts + single-gesture support (in working tree)
- **Branch**: `main`

---

## 14. How to Reproduce

1. `cd firmware && pio run --target upload` (flash firmware)
2. `cd web-app && npm run dev` (start web app)
3. Open `http://localhost:5173/severn-edge-ai/` in Chrome
4. Connect to Arduino via Bluetooth
5. Add 1 or more gestures, record 10 samples each
6. Train the model (will show 100% accuracy for single-gesture)
7. Click "Upload via Bluetooth"
8. **Expected**: "Model deployed! 🎉"
9. **Actual**: "Upload failed with status code: 11"

---

_Document prepared for senior developer/engineer review. The structural mismatch described in Section 7 is the strongest lead that has NOT yet been investigated or fixed._
