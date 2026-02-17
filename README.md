# Severn Edge AI

Machine learning education platform for Arduino BLE — students train gesture recognition models in the browser and deploy them to real hardware.

## Overview

Severn Edge AI enables 5th-grade students to collect motion data, train a neural network in their browser, and deploy it to an Arduino Nano 33 BLE for real-time inference. The system teaches core ML concepts through hands-on experience with real hardware.

## Features

- **Custom Gestures**: Students name their own gestures (2-8 classes) — not locked to presets
- **Preview Stage**: Dedicated "What the AI sees" page with live sensor exploration challenges
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
Connect → Preview Sensors → Choose Gestures → Record Samples → Train → Deploy → Test
```

1. **Connect** — Plug in Arduino, pair via Bluetooth in Chrome
2. **Preview Sensors** — Explore ax/ay/az and gx/gy/gz with student-paced mini challenges
3. **Choose Gestures** — Name 1-8 custom gestures (defaults: Wave, Shake, Circle)
4. **Record Samples** — Perform each gesture 10+ times while the app records sensor data
5. **Train** — Train the neural network in-browser and review training accuracy
6. **Deploy** — Upload the trained model to Arduino over Bluetooth
7. **Test** — Perform gestures and run the 10-turn challenge

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
│   │   │   ├── PreviewPage.tsx  # Sensor exploration + mini challenges
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
    ├── CLASSROOM_GUIDE.md                    # 3-hour lesson plan
    ├── CLASSROOM_GUIDE.pdf                   # Printable teacher guide
    ├── Severn_Edge_AI_Classroom_Slides.pptx  # Classroom projector deck
    ├── build_slides.py                       # Rebuilds classroom slide deck
    ├── build_classroom_guide_pdf.py          # Rebuilds classroom PDF from markdown
    └── AI_CONTEXT.md                         # Context handoff doc for AI agents
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
| Web App | React 19 + TypeScript + Vite + Tailwind CSS |
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
- [Classroom Guide PDF](docs/CLASSROOM_GUIDE.pdf) — Printable teacher handout
- [Classroom Slides (PPTX)](docs/Severn_Edge_AI_Classroom_Slides.pptx) — 5-slide projector deck
- [AI Context](docs/AI_CONTEXT.md) — Complete project context for AI agents
- [Neural Network Basics](firmware/docs/NEURAL_NETWORK_BASICS.md) — Educational explanation for students
- [PlatformIO Cheat Sheet PDF](docs/PlatformIO%20CLI%20Cheat%20Sheet%20%E2%80%94%20Severn%20Edge%20AI.pdf) — Classroom flashing/monitoring reference
- [CLAUDE.md](CLAUDE.md) — AI assistant development context

### Rebuild Classroom Assets

```bash
# Rebuild 5-slide classroom deck
python3 docs/build_slides.py

# Rebuild printable classroom guide PDF from markdown
python3 docs/build_classroom_guide_pdf.py
```

## License

Educational use — Severn School

## Contact

s.kembo@severnschool.com
