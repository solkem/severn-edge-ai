# TensorFlow Lite Micro Build Troubleshooting

This document outlines the build issues encountered when integrating TensorFlow Lite Micro with the Arduino Nano 33 BLE and how they were resolved.

---

## Problem 1: Wrong TensorFlow Lite Library Name

**Error:**
```
UnknownPackageError: Could not find the package with 'tensorflow/TensorFlowLite_ESP32 @ ^2.4.0' requirements for your system 'windows_amd64'
```

**Root Cause:**
The `platformio.ini` was using `tensorflow/TensorFlowLite_ESP32` which is a library specifically for **ESP32 boards**. Our project targets the **Arduino Nano 33 BLE** (Nordic nRF52840), which is a completely different microcontroller architecture.

**Solution:**
Changed the library from ESP32-specific to Arduino-compatible:
```ini
# Before
tensorflow/TensorFlowLite_ESP32@^2.4.0

# After (first attempt)
arduino-libraries/Arduino_TensorFlowLite@^2.4.0-ALPHA
```

---

## Problem 2: Library Not in PlatformIO Registry

**Error:**
```
UnknownPackageError: Could not find the package with 'arduino-libraries/Arduino_TensorFlowLite @ ^2.4.0-ALPHA' requirements for your system 'windows_amd64'
```

**Root Cause:**
The Arduino TensorFlow Lite library isn't published in PlatformIO's package registry with that name/version. PlatformIO's registry has limited TFLite options compared to the Arduino Library Manager.

**Solution:**
Used a direct GitHub URL instead of the registry name:
```ini
# Before
arduino-libraries/Arduino_TensorFlowLite@^2.4.0-ALPHA

# After
https://github.com/tensorflow/tflite-micro-arduino-examples.git
```

PlatformIO supports installing libraries directly from Git repositories, bypassing the registry entirely.

---

## Problem 3: Function Used Before Declaration

**Error:**
```
src\inference.cpp:58:12: error: 'loadModelFromFlash' was not declared in this scope
```

**Root Cause:**
In C++, functions must be declared before they're used. In `inference.cpp`, the `setupInference()` function called `loadModelFromFlash()` on line 58, but `loadModelFromFlash()` was defined later in the file (starting at line 59). The compiler reads top-to-bottom and didn't know the function existed yet.

**Solution:**
Added a **forward declaration** near the top of the file:
```cpp
// Added after includes
bool loadModelFromFlash();
```

This tells the compiler "this function exists and will be defined later" so it can compile the call before seeing the actual implementation.

---

## Problem 4: Missing Debug/Logging Function Implementations

**Error:**
```
undefined reference to `DebugLog'
undefined reference to `test_over_serial::SerialWrite(char const*)'
undefined reference to `test_over_serial::SerialReadLine(int)'
```

**Root Cause:**
The TensorFlow Lite Micro library is designed to be **platform-agnostic**. It declares logging and serial functions but expects the user to **implement them** for their specific platform. The library's `micro_log.cpp` and `test_over_serial.cpp` call these functions, but no implementation was provided, causing linker errors (compilation succeeded, but linking failed because the function bodies were missing).

**Solution:**
Created a new file `src/tflite_debug.cpp` with implementations:
```cpp
extern "C" void DebugLog(const char* s) {
    Serial.print(s);
}

namespace test_over_serial {
    void SerialWrite(const char* s) {
        Serial.print(s);
    }
    
    char* SerialReadLine(int timeout_ms) {
        static char empty[] = "";
        return empty;
    }
}
```

This provides the missing function bodies that route TFLite's debug output to Arduino's Serial interface.

---

## Problem 5: BLE "GATT Error Unknown" During Model Upload

**Error:**
```
BLE upload failed: NotSupportedError: GATT Error Unknown.
```

**Root Cause:**
This error has two contributing causes:

1. **Firmware characteristic permissions**: The `modelUploadChar` was defined with only `BLEWrite` permission, but Web Bluetooth's `writeValueWithResponse()` requires the characteristic to explicitly support write-with-response mode.

2. **Web app using unreliable writes**: The original code used `writeValue()` which defaults to "write without response" on some browsers. This can cause data loss and timing issues during multi-packet transfers like model uploads.

**Solution:**

### Firmware Fix (`main.cpp`):
Changed the characteristic definition to support both write modes:
```cpp
// Before
BLECharacteristic modelUploadChar(MODEL_UPLOAD_UUID, BLEWrite, 244);

// After
BLECharacteristic modelUploadChar(MODEL_UPLOAD_UUID, BLEWrite | BLEWriteWithoutResponse, 244);
```

### Web App Fix (`bleModelUploadService.ts`):
1. Changed all `writeValue()` calls to `writeValueWithResponse()` for reliable delivery:
```typescript
// Before
await this.modelUploadChar!.writeValue(data);

// After
await this.modelUploadChar!.writeValueWithResponse(data);
```

2. Reduced chunk size for better compatibility:
```typescript
// Before
const MAX_CHUNK_SIZE = 240;

// After
const MAX_CHUNK_SIZE = 200;  // Smaller chunks for reliability
```

3. Increased delays between BLE operations:
```typescript
// After START command
await this.delay(200);  // Was 100ms

// Between chunks
await this.delay(50);   // Was 30ms

// Before reading final status
await this.delay(1000); // Was 500ms
```

4. Added detailed console logging to help debug future issues.

---

## Summary

| # | Error Type | Root Cause | Fix |
|---|------------|------------|-----|
| 1 | Wrong library | ESP32 lib on nRF52 board | Use Arduino-compatible library |
| 2 | Package not found | Library not in PlatformIO registry | Use GitHub URL directly |
| 3 | Undeclared function | Called before definition | Add forward declaration |
| 4 | Undefined reference | Platform-specific functions not implemented | Create `tflite_debug.cpp` with implementations |
| 5 | GATT Error Unknown | BLE write mode mismatch | Add `BLEWriteWithoutResponse` flag + use `writeValueWithResponse()` |
| 6 | Status code 13 (FORMAT) | TF.js models aren't TFLite format | Use C header export or Python conversion |
| **7** | **TFLite blocked** | **Can't convert TF.js→TFLite in browser** | **Replace TFLite with SimpleNN!** |

---

## Key Takeaways

1. **Match libraries to your target board** - ESP32 libraries won't work on nRF52/ARM Cortex-M boards
2. **PlatformIO supports GitHub URLs** - When a library isn't in the registry, use the Git URL directly
3. **C++ requires forward declarations** - Functions must be declared before use
4. **TFLite Micro is platform-agnostic** - You must implement platform-specific functions like `DebugLog`
5. **BLE writes need proper permissions** - Use `BLEWrite | BLEWriteWithoutResponse` for Web Bluetooth compatibility
6. **Use writeValueWithResponse() for reliability** - Especially for multi-packet transfers like model uploads
7. **TensorFlow.js ≠ TFLite** - Browser-based models cannot be directly converted to TFLite format

---

## Problem 6: "Upload failed with status code: 13" (STATUS_ERROR_FORMAT)

**Error:**
```
Upload failed with status code: 13
BLE upload failed: Error: Upload failed with status code: 13
```

**Root Cause:**
Status code 13 is `STATUS_ERROR_FORMAT`, which means the model data was successfully transferred via BLE but **failed validation when TFLite Micro tried to load it**.

The web app's `modelToTFLiteBytes()` function was extracting raw TensorFlow.js model weights and JSON topology, but this is **NOT a valid TFLite flatbuffer format**. 

**Key insight:** TensorFlow.js models cannot be directly converted to TFLite format in the browser. TFLite conversion requires:
1. Python with TensorFlow installed
2. Converting the model using `tf.lite.TFLiteConverter`
3. Quantization and optimization for microcontrollers

**The data flow expected vs actual:**

| Step | Expected | Actual (Bug) |
|------|----------|--------------|
| Web app trains model | ✅ TF.js model | ✅ TF.js model |
| Convert to TFLite | ❌ Requires Python | ❌ Just extracted raw weights |
| Upload via BLE | ✅ .tflite bytes | ❌ JSON + float arrays |
| Arduino loads model | ❌ Invalid format | ❌ Rejected by TFLite Micro |

**Solution:**

### Current Workaround
For this educational project, the proper workflow is:

1. **Train the model** in the web app
2. **Export as C header** (`model.h`) for firmware embedding
3. **Rebuild firmware** with the new model.h
4. **Upload firmware** via USB

### For True Over-The-Air Deployment
A production solution would require:
1. A server-side Python service to convert TF.js → TFLite
2. Or pre-converted .tflite models uploaded via a file picker
3. The `loadTFLiteFile()` function was added to support uploading pre-converted .tflite files

### Code Changes
Updated `modelExportService.ts` to:
- Add clear warnings about the TFLite limitation
- Add `canConvertToTFLite()` and `getTFLiteUnavailableReason()` helper functions
- Add `loadTFLiteFile()` for loading pre-converted .tflite files
- Add console warnings when `modelToTFLiteBytes()` is called

---

## Problem 7 - THE FINAL SOLUTION: Replacing TFLite with SimpleNN

After discovering that browser-based TensorFlow.js models cannot be converted to TFLite format without a Python backend, we developed **SimpleNN** - a custom educational neural network inference engine.

### The Problem
Students (5th graders) need to:
1. Train models in the browser ✅
2. Upload trained models to Arduino via BLE ❌ (TFLite can't convert in browser)
3. Run inference on the Arduino ❌ (TFLite needs valid .tflite files)

### The Solution: SimpleNN

**SimpleNN** is a hand-written, educational neural network inference engine that:
- Uses the **exact same math** as TensorFlow, but with readable code
- Runs on Arduino with **no external dependencies**
- Can load weights directly from TensorFlow.js (no conversion needed!)
- Is **small enough** for students to understand

### Architecture

```
TensorFlow.js Model:
  Flatten → Dense(32, relu) → Dense(N, softmax)

SimpleNN on Arduino:
  Same architecture, same math, readable code!
```

### Files Changed

| File | Change |
|------|--------|
| `src/simple_nn.h` | NEW: SimpleNN class definition |
| `src/simple_nn.cpp` | NEW: Implementation with documented math |
| `src/inference.cpp` | Rewritten to use SimpleNN instead of TFLite |
| `src/flash_storage.cpp` | Updated for SimpleNN model format |
| `src/config.h` | Added `NN_INPUT_SIZE`, `NN_HIDDEN_SIZE`, `NN_MAX_CLASSES`, `MAX_MODEL_SIZE` |
| `platformio.ini` | Removed TFLite library dependency |
| `tflite_debug.cpp` | No longer needed (kept for reference) |

### Web App Files Changed

| File | Change |
|------|--------|
| `trainingService.ts` | Changed CNN → Flatten+Dense architecture |
| `modelExportService.ts` | Extract raw weights (no TFLite conversion) |
| `bleModelUploadService.ts` | Upload SimpleNN weight format |
| `constants.ts` | Added `NN_INPUT_SIZE`, `NN_HIDDEN_SIZE`, `NN_MAX_CLASSES` |

### Binary Format

SimpleNN weights are just packed float32 arrays:

```
[hiddenWeights: 32×600 floats]  // 76,800 bytes
[hiddenBiases: 32 floats]        // 128 bytes
[outputWeights: N×32 floats]     // N×128 bytes
[outputBiases: N floats]         // N×4 bytes
```

Total: ~77-78 KB depending on number of classes

### Why This Works

1. **No conversion needed**: Web app extracts TF.js weights directly
2. **Same architecture**: Both TF.js and Arduino use identical layer structure
3. **Same math**: ReLU, softmax, matrix multiply - the basics of neural networks
4. **Readable code**: Students can see exactly what's happening
5. **Educational value**: Understanding how NN inference works is more valuable than using a black box!

### Documentation

See `docs/NEURAL_NETWORK_BASICS.md` for a complete explanation of:
- What is a neuron?
- How weights and biases work
- What ReLU and softmax do
- How prediction works
- Why SimpleNN is perfect for education
