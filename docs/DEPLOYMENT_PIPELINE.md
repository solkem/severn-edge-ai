# Severn Edge AI - Deployment Pipeline

This document explains how to train a gesture recognition model in the browser and deploy it to your Arduino Nano 33 BLE Sense.

---

## 🎯 Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────────┐  │
│   │   COLLECT   │ ───▶ │    TRAIN    │ ───▶ │   DEPLOY    │ ───▶ │   TEST   │  │
│   │  (Browser)  │      │  (Browser)  │      │  (Browser)  │      │ (Arduino)│  │
│   └─────────────┘      └─────────────┘      └─────────────┘      └──────────┘  │
│         │                    │                    │                    │        │
│         ▼                    ▼                    ▼                    ▼        │
│   Record gestures      Train CNN model      Upload via BLE       Run inference │
│   via BLE stream       in TensorFlow.js     OR download .h       on device     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 🚀 Two Deployment Options

| Method | Best For | Steps |
|--------|----------|-------|
| **BLE Upload** (Recommended) | Students, quick iteration | Click "Upload via Bluetooth" - done! |
| **Manual Export** | Advanced users, custom builds | Download model.h, replace in firmware, rebuild |

---

## 📊 Step 1: Collect Training Data

**Location:** Web App → Connect → Collect Page

```
┌────────────────────────────────────────────────────────────────┐
│                     COLLECT PAGE                               │
│                                                                │
│   ┌──────────────┐   BLE Sensor Stream   ┌──────────────────┐ │
│   │   Arduino    │ ─────────────────────▶│   Web Browser    │ │
│   │   Nano 33    │   17-byte packets     │                  │ │
│   │   BLE Sense  │   @ 25 Hz             │   samples[]      │ │
│   └──────────────┘                       │   ├─ Wave (10)   │ │
│         │                                │   ├─ Shake (10)  │ │
│         │                                │   └─ Circle (10) │ │
│   IMU Sensor                             └──────────────────┘ │
│   (BMI270/LSM9DS1)                                            │
│                                                                │
│   Packet Format:                                               │
│   ┌────┬────┬────┬────┬────┬────┬─────┬─────┬─────┐           │
│   │ ax │ ay │ az │ gx │ gy │ gz │ seq │ ts  │ crc │           │
│   └────┴────┴────┴────┴────┴────┴─────┴─────┴─────┘           │
│   int16 × 6        uint16 × 2    uint8                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**What happens:**
1. You connect to the Arduino via Web Bluetooth
2. For each gesture (Wave, Shake, Circle), you record 10 samples
3. Each sample is 4 seconds of IMU data (100 readings at 25Hz)
4. Data is stored in browser memory as `Sample[]`

---

## 🧠 Step 2: Train the Model

**Location:** Web App → Train Page

```
┌────────────────────────────────────────────────────────────────┐
│                     TRAINING PIPELINE                          │
│                                                                │
│   Input: samples[]                                             │
│   Shape: (30, 100, 6)  ──▶  30 samples × 100 timesteps × 6 axes│
│                                                                │
│   ┌────────────────────────────────────────────────────────┐  │
│   │              1D CNN Architecture                        │  │
│   │                                                         │  │
│   │   Input (100, 6)                                       │  │
│   │         │                                               │  │
│   │         ▼                                               │  │
│   │   ┌─────────────┐                                       │  │
│   │   │ BatchNorm   │                                       │  │
│   │   └─────────────┘                                       │  │
│   │         │                                               │  │
│   │         ▼                                               │  │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│   │   │ Conv1D (8)  │─▶│ Conv1D (16) │─▶│ Conv1D (32) │    │  │
│   │   │ + MaxPool   │  │ + MaxPool   │  │ + MaxPool   │    │  │
│   │   └─────────────┘  └─────────────┘  └─────────────┘    │  │
│   │                           │                             │  │
│   │                           ▼                             │  │
│   │                    ┌─────────────┐                      │  │
│   │                    │   Flatten   │                      │  │
│   │                    └─────────────┘                      │  │
│   │                           │                             │  │
│   │                           ▼                             │  │
│   │                    ┌─────────────┐                      │  │
│   │                    │ Dense (24)  │                      │  │
│   │                    │ + Dropout   │                      │  │
│   │                    └─────────────┘                      │  │
│   │                           │                             │  │
│   │                           ▼                             │  │
│   │                    ┌─────────────┐                      │  │
│   │                    │ Dense (3)   │  ◀── num_classes     │  │
│   │                    │  Softmax    │                      │  │
│   │                    └─────────────┘                      │  │
│   │                           │                             │  │
│   │                           ▼                             │  │
│   │                    Output: [Wave, Shake, Circle]        │  │
│   │                    probabilities                        │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                │
│   Training: 50 epochs, Adam optimizer, ~30 seconds             │
│   Output: TensorFlow.js model in browser memory                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**What happens:**
1. Samples are normalized and padded to (100, 6) shape
2. Model is trained using TensorFlow.js in the browser
3. No server required - everything runs locally!
4. Typical accuracy: 85-95%

---

## 📦 Step 3: Deploy Your Model

**Location:** Web App → Train Page (after training completes)

### Option A: BLE Upload (Recommended for Students) 📡

```
┌────────────────────────────────────────────────────────────────┐
│                   ONE-CLICK DEPLOYMENT                         │
│                                                                │
│   ┌──────────────────┐    BLE Model Upload    ┌─────────────┐ │
│   │    Web Browser   │ ─────────────────────▶ │   Arduino   │ │
│   │                  │    Chunks (240 bytes)  │             │ │
│   │  "Upload via     │    with CRC32 verify   │  Saves to   │ │
│   │   Bluetooth"     │                        │  RAM/Flash  │ │
│   └──────────────────┘                        └─────────────┘ │
│                                                     │          │
│   Upload Protocol:                                  ▼          │
│   1. START cmd (size, CRC, class labels)     Auto-reload      │
│   2. CHUNK cmds (offset + data)              inference        │
│   3. COMPLETE cmd (verify & save)            engine           │
│                                                                │
│   ✅ No coding required!                                       │
│   ✅ Model active immediately                                  │
│   ✅ Perfect for classroom use                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Steps:**
1. Complete training in the web app
2. Make sure you're still connected via Bluetooth
3. Click **"📡 Upload via Bluetooth"**
4. Wait for progress bar to complete
5. Your model is now running on the Arduino!

---

### Option B: Manual Export (Advanced Users) ⬇️

```
┌────────────────────────────────────────────────────────────────┐
│                     MANUAL EXPORT PIPELINE                     │
│                                                                │
│   TensorFlow.js Model                                          │
│         │                                                      │
│         ▼                                                      │
│   ┌─────────────────────────────────────────────────────────┐ │
│   │  modelExportService.ts                                   │ │
│   │                                                          │ │
│   │  1. Extract model topology (JSON)                        │ │
│   │  2. Extract weight tensors (Float32Arrays)               │ │
│   │  3. Combine into single byte array                       │ │
│   │  4. Generate C header file                               │ │
│   └─────────────────────────────────────────────────────────┘ │
│         │                                                      │
│         ▼                                                      │
│   ┌─────────────────────────────────────────────────────────┐ │
│   │  model.h (Downloaded File)                               │ │
│   │                                                          │ │
│   │  alignas(8) const unsigned char trained_model[] = {      │ │
│   │      0x1c, 0x00, 0x00, 0x00, 0x54, 0x46, 0x4c, 0x33,     │ │
│   │      0x00, 0x00, 0x00, 0x00, ...                         │ │
│   │  };                                                      │ │
│   │                                                          │ │
│   │  const unsigned int trained_model_len = 12345;           │ │
│   │                                                          │ │
│   │  #define MODEL_NUM_CLASSES 3                             │ │
│   │  const char* CLASS_LABELS[] = {"Wave", "Shake", "Circle"}│ │
│   │                                                          │ │
│   └─────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Steps:**
1. Click "⬇️ .h file" to download `model.h`
2. Replace `firmware/src/model.h` with your downloaded file
3. Build and upload with PlatformIO:

```powershell
cd firmware
pio run -e nano33ble_rev2 -t upload
```

---

## 🚀 Step 4: Test Your Model

**Location:** Web App → Test Page (or standalone Arduino)

```
┌────────────────────────────────────────────────────────────────┐
│                   ON-DEVICE INFERENCE                          │
│                                                                │
│   ┌──────────────────────────────────────────────────────────┐│
│   │                    Arduino Nano 33 BLE                   ││
│   │                                                          ││
│   │   ┌────────────┐      ┌──────────────────────────────┐  ││
│   │   │   BMI270   │ ───▶ │    Sliding Window Buffer     │  ││
│   │   │   Sensor   │      │    sampleBuffer[100][6]      │  ││
│   │   └────────────┘      └──────────────────────────────┘  ││
│   │         │                        │                       ││
│   │     25 Hz                        │ When buffer full      ││
│   │                                  ▼                       ││
│   │                         ┌─────────────────┐              ││
│   │                         │  TFLite Micro   │              ││
│   │                         │   Interpreter   │              ││
│   │                         │                 │              ││
│   │                         │  Loaded Model   │              ││
│   │                         │  (via BLE/RAM)  │              ││
│   │                         └─────────────────┘              ││
│   │                                  │                       ││
│   │                                  ▼                       ││
│   │                         ┌─────────────────┐              ││
│   │                         │   Prediction    │              ││
│   │                         │   + Confidence  │              ││
│   │                         │   "Wave" (92%)  │              ││
│   │                         └─────────────────┘              ││
│   │                                  │                       ││
│   │                                  ▼                       ││
│   │                         Send via BLE to app              ││
│   │                                                          ││
│   └──────────────────────────────────────────────────────────┘│
│                                                                │
│   Memory Usage:                                                │
│   ├── Tensor Arena: 20KB                                       │
│   ├── Sample Buffer: 2.4KB (100 × 6 × 4 bytes)                 │
│   ├── Model Buffer: up to 20KB (for BLE-uploaded models)       │
│   └── Total: ~45KB of 256KB available                          │
│                                                                │
│   Inference Time: ~10-20ms per prediction                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
severn-edge-ai/
├── firmware/                      # Arduino code
│   ├── platformio.ini             # PlatformIO configuration
│   └── src/
│       ├── main.cpp               # Main entry point + BLE handlers
│       ├── config.h               # Constants, UUIDs, sizes
│       ├── sensor_reader.h        # Sensor abstraction
│       ├── sensor_bmi270.cpp      # BMI270 driver (Rev2)
│       ├── sensor_lsm9ds1.cpp     # LSM9DS1 driver (Rev1)
│       ├── inference.h            # Inference API
│       ├── inference.cpp          # TFLite Micro implementation
│       ├── flash_storage.h        # Model persistence API
│       ├── flash_storage.cpp      # Model storage implementation
│       └── model.h                # Fallback embedded model
│
└── web-app/                       # React web application
    └── src/
        ├── pages/
        │   ├── ConnectPage.tsx    # BLE connection
        │   ├── CollectPage.tsx    # Data collection
        │   ├── TrainPage.tsx      # Training + deployment
        │   └── TestPage.tsx       # Live inference
        │
        └── services/
            ├── bleService.ts           # BLE communication
            ├── bleModelUploadService.ts # OTA model deployment
            ├── trainingService.ts      # TensorFlow.js training
            └── modelExportService.ts   # C header generation
```

---

## 🛠️ Quick Reference

### Build & Upload (PlatformIO CLI)
```powershell
cd firmware

# Build only
pio run -e nano33ble_rev2

# Build and upload
pio run -e nano33ble_rev2 -t upload

# Open serial monitor
pio device monitor
```

### Development Server (Web App)
```powershell
cd web-app
npm install
npm run dev
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| BLE upload fails | Ensure Arduino is connected, check browser console for errors |
| Model not loading | Check `trained_model_len` in model.h - should be > 100 bytes |
| TFLite schema mismatch | Ensure TensorFlow.js and TFLite Micro versions are compatible |
| Out of memory | Reduce `TENSOR_ARENA_SIZE` in config.h or simplify model |
| Low accuracy | Collect more diverse training samples, ensure consistent gestures |
| BLE not connecting | Check device name matches `DEVICE_NAME_PREFIX` in config.h |

---

## 📚 Learn More

- [TensorFlow Lite for Microcontrollers](https://www.tensorflow.org/lite/microcontrollers)
- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [Arduino Nano 33 BLE Sense](https://docs.arduino.cc/hardware/nano-33-ble-sense)
- [PlatformIO Documentation](https://docs.platformio.org/)
