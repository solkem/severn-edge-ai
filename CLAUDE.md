# Severn Edge AI - AI Assistant Context

> This file provides context for AI assistants working with this codebase.

## Project Overview

**Severn Edge AI** is an educational machine learning platform designed for teaching 5th graders about AI and gesture recognition. Students train a neural network in their browser, then deploy it to an Arduino Nano 33 BLE for real-time inference.

**Target Audience:** 5th grade students (10-11 years old)
**Educational Goal:** Demystify AI by letting students train and deploy their own gesture recognition model

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web App (Browser)                         │
│  React + TypeScript + TensorFlow.js + Tailwind CSS              │
│  - Collect training data via BLE                                 │
│  - Train neural network in browser                               │
│  - Deploy model to Arduino via BLE OTA                          │
└─────────────────────────────────────────────────────────────────┘
                              │ BLE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Arduino Nano 33 BLE Sense                      │
│  C++ with SimpleNN inference engine                              │
│  - Read IMU sensor data (accelerometer + gyroscope)             │
│  - Run neural network inference on-device                        │
│  - Send predictions back to web app                              │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
severn-edge-ai/
├── firmware/                    # Arduino C++ code
│   ├── src/
│   │   ├── main.cpp            # Entry point, BLE setup, main loop
│   │   ├── config.h            # All configuration constants
│   │   ├── inference.cpp/h     # Sliding window + normalization
│   │   ├── simple_nn.cpp/h     # Hand-written neural network engine
│   │   ├── flash_storage.cpp/h # Model persistence in flash
│   │   ├── sensor_bmi270.cpp   # BMI270 IMU driver (Rev2 boards)
│   │   ├── sensor_lsm9ds1.cpp  # LSM9DS1 IMU driver (Rev1 boards)
│   │   └── sensor_reader.h     # Sensor abstraction interface
│   ├── platformio.ini          # PlatformIO build configuration
│   └── docs/
│       └── NEURAL_NETWORK_BASICS.md  # Educational NN explanation
│
├── web-app/                     # React web application
│   ├── src/
│   │   ├── App.tsx             # Main app with wizard flow
│   │   ├── pages/
│   │   │   ├── ConnectPage.tsx # BLE device connection
│   │   │   ├── CollectPage.tsx # Training data recording
│   │   │   ├── TrainPage.tsx   # Model training + deployment
│   │   │   └── TestPage.tsx    # Live inference testing
│   │   ├── services/
│   │   │   ├── bleService.ts       # BLE connection management
│   │   │   ├── bleParser.ts        # Binary packet parsing
│   │   │   ├── trainingService.ts  # TensorFlow.js training
│   │   │   ├── modelExportService.ts    # Convert to SimpleNN format
│   │   │   └── bleModelUploadService.ts # OTA model upload
│   │   ├── config/
│   │   │   └── constants.ts    # Shared constants (must match firmware!)
│   │   └── types/
│   │       ├── ble.ts          # BLE packet type definitions
│   │       └── index.ts        # General TypeScript types
│   └── package.json
│
└── CLAUDE.md                    # This file
```

## Critical Synchronization Points

### ⚠️ Normalization Constants (MUST MATCH)

The neural network only works correctly if normalization is identical during training and inference.

**Web App** (`web-app/src/services/trainingService.ts`):
```typescript
const NORM_ACCEL = 4.0;    // Accelerometer: divide by 4.0
const NORM_GYRO = 500.0;   // Gyroscope: divide by 500.0
```

**Firmware** (`firmware/src/inference.cpp`):
```cpp
static const float NORM_ACCEL = 4.0f;
static const float NORM_GYRO = 500.0f;
```

**Also in firmware** (`firmware/src/config.h`):
```cpp
#define ACCEL_SCALE 8192.0f   // int16 → g units
#define GYRO_SCALE 16.4f      // int16 → dps units
```

The complete pipeline:
1. Raw int16 from sensor
2. Firmware: `raw / ACCEL_SCALE` → physical units (g or dps)
3. Web app receives physical units via BLE
4. Training: `physical / NORM_ACCEL` → normalized (-1 to +1)
5. Inference: `raw / (ACCEL_SCALE * NORM_ACCEL)` → same normalized values

### ⚠️ Model Architecture (MUST MATCH)

**Web App** (`web-app/src/config/constants.ts`):
```typescript
export const MODEL_CONFIG = {
  WINDOW_SIZE: 100,      // 100 samples per inference window
  NUM_AXES: 6,           // ax, ay, az, gx, gy, gz
  WINDOW_STRIDE: 25,     // Samples between predictions
};
export const NN_HIDDEN_SIZE = 32;  // Hidden layer neurons
```

**Firmware** (`firmware/src/config.h`):
```cpp
#define WINDOW_SIZE 100
#define WINDOW_STRIDE 25
#define NN_HIDDEN_SIZE 32
#define NN_INPUT_SIZE 600  // 100 * 6
```

### ⚠️ BLE UUIDs (MUST MATCH)

Both sides must use identical UUIDs:
- Service: `19B10000-E8F2-537E-4F6C-D104768A1214`
- Mode: `19B10001-...`
- Sensor: `19B10002-...`
- Inference: `19B10003-...`
- Device Info: `19B10004-...`
- Config: `19B10005-...`
- Model Upload: `19B10006-...`
- Model Status: `19B10007-...`

## Key Commands

### Firmware

```bash
# Build firmware
cd firmware
pio run

# Upload to Arduino
pio run -t upload

# Monitor serial output
pio device monitor

# Clean build
pio run -t clean
```

### Web App

```bash
# Install dependencies
cd web-app
npm install

# Start development server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Type check
npx tsc --noEmit
```

## Neural Network Architecture

```
Input Layer: 600 values (100 timesteps × 6 axes)
    ↓
Flatten
    ↓
Dense Layer: 32 neurons, ReLU activation
    ↓
Output Layer: N neurons (one per gesture), Softmax activation
    ↓
Prediction: Gesture class with highest probability
```

**SimpleNN Format** (firmware/src/simple_nn.h):
- Header: magic, version, input size, hidden size, output size
- Hidden weights: float32[hidden_size × input_size]
- Hidden biases: float32[hidden_size]
- Output weights: float32[output_size × hidden_size]
- Output biases: float32[output_size]
- Class labels: null-terminated strings

## Common Issues & Solutions

### "Model runs but always predicts the same class"
- Check normalization matches between web app and firmware
- Verify model was actually uploaded (check `hasStoredModel()`)
- Look at serial monitor for confidence values

### "BLE connection drops during model upload"
- Large models may take 30+ seconds to transfer
- Check `MODEL_CHUNK_SIZE` (default 240 bytes)
- Verify CRC validation is passing

### "Training accuracy is low"
- Collect more samples (10+ per gesture)
- Ensure gestures are distinct (wave vs circle vs shake)
- Check data augmentation is enabled

### "Inference is slow"
- `WINDOW_STRIDE` controls prediction frequency
- Current: 25 samples = ~1 second between predictions
- Can reduce for faster response, but may reduce accuracy

### "Build fails with memory errors"
- SimpleNN uses ~80KB RAM for weights
- Arduino Nano 33 BLE has 256KB RAM
- Check `RAM: XX%` in build output

## Hardware Support

| Board | Sensor | Chip ID |
|-------|--------|---------|
| Arduino Nano 33 BLE Sense Rev1 | LSM9DS1 | 0x01 |
| Arduino Nano 33 BLE Sense Rev2 | BMI270 | 0x02 |

Auto-detected at runtime. Device name includes hardware ID: `SevernEdgeAI-XXXX`

## Testing Checklist

1. ✅ Connect to Arduino via BLE
2. ✅ Collect training samples (10+ per gesture)
3. ✅ Train model (should reach >80% accuracy)
4. ✅ Deploy model via Bluetooth
5. ✅ Test inference (predictions should change with gestures)

## Code Style

- **TypeScript:** Use strict mode, prefer `const`, explicit types
- **C++:** Arduino style, use `DEBUG_PRINT` macros for logging
- **Comments:** Educational tone, explain "why" not just "what"
- **Naming:** camelCase for JS/TS, snake_case for C++

## Documentation

- `firmware/docs/NEURAL_NETWORK_BASICS.md` - Educational NN guide for students
- `firmware/README.md` - Firmware-specific setup
- `web-app/README.md` - Web app setup
- Root `README.md` - Project overview

## Version History

- **v1.0:** Initial release with TFLite
- **v1.1:** Switched to SimpleNN (hand-written inference engine)
  - Removed TensorFlow Lite Micro dependency
  - Educational: students can see matrix multiplication
  - Smaller binary size, faster inference

## Contact

Repository: https://github.com/solkem/severn-edge-ai
