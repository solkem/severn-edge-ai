# Severn Edge AI

Machine learning education platform for Arduino BLE — students train gesture recognition models in the browser and deploy them to real hardware.

## Overview

Severn Edge AI enables 5th-grade students to collect motion data, train a neural network in their browser, and deploy it to an Arduino Nano 33 BLE for real-time inference. The system teaches core ML concepts through hands-on experience with real hardware.

## Features

- **Custom Gestures**: Students name their own gestures (2-8 classes) — not locked to presets
- **Live Sensor Display**: Collapsible "See what the AI sees" panel shows raw numbers during recording
- **Friendly Device Names**: Each Arduino shows as `SevernEdgeAI-1`, `SevernEdgeAI-2`, etc. via configurable lookup table
- **Kid-Friendly UX**: Celebratory feedback, gentle quality validation, step-by-step wizard flow
- **In-Browser Training**: TensorFlow.js trains the model entirely in Chrome — no server needed
- **Over-the-Air Deployment**: Upload trained models to Arduino via Bluetooth
- **Hardware Auto-Detection**: Supports both Rev1 (LSM9DS1) and Rev2 (BMI270) boards

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web App (Browser)                         │
│  React + TypeScript + TensorFlow.js + Tailwind CSS              │
│  - Choose gestures → Collect data via BLE → Train in browser    │
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

## Student Workflow

```
Connect → Choose Gestures → Record Samples → Train → Deploy → Test
```

1. **Connect** — Plug in Arduino, pair via Bluetooth in Chrome
2. **Choose Gestures** — Name 2-8 custom gestures (defaults: Wave, Shake, Circle)
3. **Record Samples** — Perform each gesture 10+ times while the app records sensor data
4. **Train** — Watch the neural network learn in real-time (accuracy climbs to 80%+)
5. **Deploy** — Upload the trained model to Arduino over Bluetooth
6. **Test** — Perform gestures and see live predictions on the Arduino

## Project Structure

```
severn-edge-ai/
├── firmware/                    # Arduino C++ code (PlatformIO)
│   ├── src/
│   │   ├── main.cpp            # BLE setup, main loop, device naming
│   │   ├── config.h            # Configuration, device name mapping
│   │   ├── simple_nn.cpp/h     # Hand-written neural network engine
│   │   ├── inference.cpp/h     # Sliding window + normalization
│   │   ├── flash_storage.cpp/h # Model persistence in flash
│   │   ├── sensor_bmi270.cpp   # BMI270 IMU driver (Rev2)
│   │   └── sensor_lsm9ds1.cpp  # LSM9DS1 IMU driver (Rev1)
│   └── platformio.ini
├── web-app/                     # React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ConnectPage.tsx  # BLE device connection
│   │   │   ├── CollectPage.tsx  # Gesture setup + data recording
│   │   │   ├── TrainPage.tsx    # Model training + deployment
│   │   │   └── TestPage.tsx     # Live inference testing
│   │   ├── services/
│   │   │   ├── bleService.ts        # BLE connection management
│   │   │   ├── trainingService.ts   # TensorFlow.js training
│   │   │   └── bleModelUploadService.ts # OTA model upload
│   │   └── config/
│   │       └── constants.ts     # Shared constants (must match firmware)
│   └── package.json
└── docs/
    ├── CLASSROOM_GUIDE.md       # 3-hour lesson plan with contest
    └── NEURAL_NETWORK_BASICS.md # Educational NN explanation
```

## Quick Start

### Firmware

```bash
cd firmware
pio run -t upload    # Build and flash to Arduino
pio device monitor   # View serial output (115200 baud)
```

### Web App

**Live:** https://solkem.github.io/severn-edge-ai/

Or run locally:

```bash
cd web-app
npm install
npm run dev          # Start dev server at localhost:5173
```

Open in **Chrome** (BLE requires Chromium). Connect to your Arduino and follow the wizard.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Hardware | Arduino Nano 33 BLE Sense (Rev1/Rev2) |
| Firmware | PlatformIO + SimpleNN (hand-written inference engine) |
| Communication | Web Bluetooth (25Hz, int16, CRC-8) |
| Web App | React 18 + TypeScript + Vite + Tailwind CSS |
| ML Training | TensorFlow.js (in-browser) |
| Model Format | SimpleNN (dense layers, float32 weights) |

## Neural Network

```
Input: 600 values (100 timesteps × 6 axes)
  → Flatten
  → Dense(32, ReLU)
  → Dense(N, Softmax)    # N = number of gesture classes
  → Prediction
```

Trained in ~30 seconds on a laptop. Model size: ~78 KB. Inference on Arduino: real-time.

## Adding Classroom Arduinos

Each board auto-detects its hardware ID. Map it to a friendly number in `firmware/src/config.h`:

```cpp
static const DeviceMapping DEVICE_MAP[] = {
  {0x6F7B, 8},
  {0x4320, 2},
  // Flash with empty table, check serial output for new board hex IDs
};
```

Flash the same firmware to all boards — each resolves its own name at boot.

## Documentation

- [Classroom Guide](docs/CLASSROOM_GUIDE.md) — 3-hour lesson plan with The Swap Challenge contest
- [AI Context](docs/AI_CONTEXT.md) — Complete project context for AI agents
- [Neural Network Basics](firmware/docs/NEURAL_NETWORK_BASICS.md) — Educational explanation for students
- [CLAUDE.md](CLAUDE.md) — AI assistant development context

## License

Educational use — Severn School

## Contact

s.kembo@severnschool.com
