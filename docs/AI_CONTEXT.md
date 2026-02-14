# Severn Edge AI — Complete Project Context for AI Agents

> This document gives an AI agent everything it needs to understand, discuss, modify, or extend this project. Read it fully before acting.

---

## What Is This Project?

Severn Edge AI is a **machine learning education platform** for 5th graders (ages 10-11) at Severn School. Students train a gesture recognition neural network in their browser, then deploy it to a physical Arduino board that runs inference in real-time. The student performs a gesture (wave, shake, etc.), and the Arduino predicts which gesture it is.

The entire system is designed so a 10-year-old can operate it with no prior ML knowledge. Every UI decision, every label, every feedback message is optimized for that audience.

**Live URL:** https://solkem.github.io/severn-edge-ai/
**Repository:** https://github.com/solkem/severn-edge-ai

---

## How It Works (End to End)

```
Student picks up Arduino
        │
        ▼
Opens Chrome web app → clicks Connect → picks "SevernEdgeAI-8" from Bluetooth dialog
        │
        ▼
Names their gestures (e.g. "Cast Spell", "Swing Bat", "Stir Pot")
        │
        ▼
Records 10+ samples per gesture (holds Arduino and performs gesture for 4 seconds each)
        │
        ▼
Clicks Train → TensorFlow.js trains a neural network in the browser (~30 seconds)
        │
        ▼
Clicks Deploy → model weights sent to Arduino over Bluetooth
        │
        ▼
Switches to Test mode → performs gestures → Arduino predicts in real-time
```

No servers, no accounts, no internet required after initial page load. Everything runs in Chrome + on the Arduino.

---

## Architecture

There are exactly two components:

### 1. Web App (Browser)
- **Stack:** React 18 + TypeScript + Vite + Tailwind CSS + TensorFlow.js
- **What it does:** Wizard flow through Connect → Collect → Train → Test
- **Key feature:** "See what the AI sees" — live panel showing 6 sensor values with color-coded bars
- **Training:** TensorFlow.js trains entirely in-browser. No backend.
- **Deployment:** Trained model weights sent to Arduino via Web Bluetooth API

### 2. Firmware (Arduino)
- **Hardware:** Arduino Nano 33 BLE Sense (Rev1 with LSM9DS1, Rev2 with BMI270)
- **Stack:** C++ with PlatformIO build system
- **Inference engine:** SimpleNN — a hand-written neural network (not TensorFlow Lite). Matrix multiplication, ReLU, softmax — all visible in code. This is intentional: students can see what a neural network actually computes.
- **Communication:** BLE with custom service UUID, 25Hz sensor streaming, OTA model upload

### Communication Flow
```
Arduino sensors (25Hz) → BLE packets (17 bytes each) → Web app parses → Training data
Web app trains model → SimpleNN weights → BLE chunked upload (240 bytes/chunk) → Arduino flash
Arduino reads sensors → SimpleNN inference → BLE prediction packet → Web app displays result
```

---

## Neural Network Architecture

```
Input: 600 floats (100 timesteps × 6 axes: ax, ay, az, gx, gy, gz)
  → Flatten
  → Dense(32 neurons, ReLU activation)
  → Dense(N neurons, Softmax activation)    // N = number of gesture classes (2-8)
  → Prediction: gesture class with highest probability
```

- **Training time:** ~30 seconds in browser
- **Model size:** ~78 KB (float32 weights)
- **Inference speed:** Real-time on Arduino (ARM Cortex-M4 @ 64MHz)

### Critical Synchronization — These MUST Match

| Parameter | Web App (`constants.ts`) | Firmware (`config.h`) |
|-----------|------------------------|-----------------------|
| Window size | `WINDOW_SIZE: 100` | `#define WINDOW_SIZE 100` |
| Axes | `NUM_AXES: 6` | Implicit (6 axes) |
| Hidden neurons | `NN_HIDDEN_SIZE: 32` | `#define NN_HIDDEN_SIZE 32` |
| Input size | `NN_INPUT_SIZE: 600` | `#define NN_INPUT_SIZE 600` |
| Max classes | `NN_MAX_CLASSES: 8` | `#define NN_MAX_CLASSES 8` |
| Normalization (accel) | `NORM_ACCEL = 4.0` | `NORM_ACCEL = 4.0f` |
| Normalization (gyro) | `NORM_GYRO = 500.0` | `NORM_GYRO = 500.0f` |

If any of these are changed in one place but not the other, the model will produce garbage predictions.

---

## The Sensors (What Students See)

The Arduino has a 6-axis IMU (Inertial Measurement Unit):

**Accelerometer (ax, ay, az)** — Red bars in the UI
- Measures all forces on the board. When still, that force is gravity — tells you which way is down.
- Shaking changes readings even if tilt doesn't change.
- Units: g-force (1g = Earth's gravity)

**Gyroscope (gx, gy, gz)** — Blue bars in the UI
- Measures how fast the board is rotating.
- Still = values near zero. Spin = values spike.
- Units: degrees per second

**Sampling rate:** 25 Hz (25 readings per second). Each reading is 6 values. One inference window = 100 readings = 4 seconds of data.

**Data pipeline:**
1. Sensor chip outputs raw int16 values
2. Firmware scales: `raw / 8192.0` (accel → g), `raw / 16.4` (gyro → dps)
3. Web app receives physical units via BLE
4. Training normalizes: `value / 4.0` (accel), `value / 500.0` (gyro)
5. Firmware inference applies same normalization to match

---

## Web App Page Flow

The app is a wizard with 4 pages:

### ConnectPage
- Bluetooth pairing dialog (Chrome only)
- Filters for devices matching `SevernEdgeAI-*` prefix
- Shows connection checklist: power on (green LED), enable Bluetooth, keep close

### CollectPage (Two Phases)

**Phase 1 — Gesture Setup:**
- Students see editable "pills" with default gestures (Wave, Shake, Circle)
- Can click to rename, X to remove, or type to add new ones
- Minimum 2 gestures, maximum 8, names max 15 characters
- "I'm Ready! Start Recording" button advances to Phase 2

**Phase 2 — Recording:**
- Grid of gesture cards showing progress (0/10 → 10/10 → DONE)
- Click a gesture → click Record → perform gesture for 4 seconds
- KidFeedback component shows celebratory messages ("AMAZING!", "You're a natural!")
- Quality validation rejects low-motion samples
- **"See what the AI sees" panel** — collapsible dark terminal showing live ax/ay/az/gx/gy/gz values with animated bars. Stays open across recording state changes.

### TrainPage
- Starts TensorFlow.js training, shows epoch-by-epoch accuracy
- Deploys model to Arduino via BLE chunked upload
- Shows upload progress, CRC validation per chunk

### TestPage
- Arduino runs inference on-device
- Predictions streamed back via BLE
- Shows predicted gesture name + confidence percentage

---

## Classroom Guide — The Teaching Plan

This is the centerpiece of the project's educational value. The full guide lives at `docs/CLASSROOM_GUIDE.md`.

### Overview

**Duration:** 3 hours
**Format:** Every student has their own Arduino and laptop (no pairing)
**Arc:** Explore → Understand → Create → Compete → Reflect

### Hour 1: "What Does AI Actually See?" (60 min)

**Hook (15 min):**
- Teacher asks "Is AI magic?" then shakes the Arduino with the sensor panel visible
- Key reveal: AI sees 6 numbers, not motion. It finds patterns in numbers.

**Live Demo (15 min):**
- Teacher runs the entire flow end-to-end (connect → record → train → deploy → test)
- Goal: show the finish line so kids know what they're building toward

**Connect (15 min):**
- Each student connects to their named Arduino (e.g. "SevernEdgeAI-8")
- Boards are physically labeled to match

**Explore the Sensor (5 min):**
- Students open the "See what the AI sees" panel
- Move the Arduino, watch numbers react
- Guided prompts: "Wave it — what changes?", "Hold still — what do you see?", "Flip upside down — which number moved?"

**Sensor Challenges (10 min):**
These are the key pedagogical innovation. Four progressive challenges that build intuition about feature relevance:

1. **"Same or Different?"** — Slow wave vs fast wave. Can you see the difference in the panel? (Teaches: speed affects gyro amplitude. Similar gestures have subtle differences.)

2. **"Find the Axis"** — Make ONLY the gz bar move. (Teaches: spinning like a top isolates one axis. Each axis responds to a specific motion type. The AI has 6 independent signals.)

3. **"Trick Question"** — Do a big circle, then stir a pot. Are the numbers the same? (Usually yes. Teaches: two gestures that LOOK different to a human can be IDENTICAL to the sensor. The AI doesn't see what you see.)

4. **"Design Your Gestures"** — Before picking gestures, test them on the panel. Do they light up different bars? (Teaches: use the panel as a design tool. Sensor-distinct gestures will train better. This directly improves performance in the competition.)

**Why the challenges matter:** Students who do these will:
- Pick better gestures (sensor-distinct, not just visually distinct)
- Get higher training accuracy
- Score better in The Swap Challenge
- Actually understand WHY their model works or fails

### Hour 2: "Teach Your AI" (60 min)

**What Makes Good Training Data (5 min):**
- Side-by-side demo: consistent recording vs sloppy recording
- Core lesson: "Garbage in, garbage out"

**Choose Gestures (10 min):**
- Students name 3 custom gestures. Encouraged to be creative: "Cast a spell", "Swing a bat", "Stir a pot"
- Rule: gestures must be physically distinct. Similar gestures = confused AI.
- Students who did sensor challenges already know to check the panel first.

**Collect Training Data (30 min):**
- 10+ samples per gesture, 4 seconds each
- Sensor panel stays open during recording — kids see the numbers as they move
- Teacher circulates helping with common issues (not enough motion, gestures too similar)

**Deploy + First Test (15 min):**
- Train (watch accuracy climb past 80%)
- Deploy via Bluetooth
- First live inference — celebration moment

### Hour 3: "The Gesture Games" (60 min)

**The Swap Challenge (40 min) — the main event:**

This contest tests whether models learned real patterns vs memorizing one person's style.

*Round 1 — Guess the Gestures (15 min):*
- Students pair up, swap Arduinos
- You see predictions (Gesture 0, 1, 2) but NOT the names
- Try different motions to figure out what your partner's 3 gestures are
- First to correctly name all 3 wins

*Round 2 — The Stranger Test (15 min):*
- Partner demonstrates their gestures
- You perform them on their Arduino
- Score: how many correct out of 10?
- Tests GENERALIZATION — did the model learn "the gesture" or just "your hand"?

**Why this works pedagogically:**
- Round 1: forces students to think about what the AI "sees" (reverse engineering)
- Round 2: teaches the core ML concept of generalization without using the word
- Physical and competitive — kids are moving, shouting, laughing
- Students who understood the sensors and picked distinct gestures will win

**Reflection (15 min):**
- "What made your model better?" → Data quality, distinct gestures, consistency
- "What made it worse?" → Similar gestures, sloppy recording
- "Could the AI learn any gesture?" → What are the limits?
- Core lessons drawn out: data quality matters, distinct patterns help, AI is pattern matching on numbers

**Wrap-Up (5 min):**
- "You just trained and deployed a real neural network. That's what AI engineers do. You used 30 samples and 6 sensors. A self-driving car uses millions of samples and hundreds of sensors. But the idea is exactly the same."

### Bonus Contests

**The Fourth Gesture Challenge:** Add a 4th gesture and retrain. Can you find one that doesn't hurt accuracy? Teaches: more classes = harder classification.

**Fool the AI:** Try to find motions that trick another student's model. Teaches adversarial thinking.

---

## Key Design Decisions (and Why)

| Decision | Why |
|----------|-----|
| SimpleNN instead of TFLite | Students can read the matrix math. Educational transparency. Also smaller binary. |
| Custom gestures instead of hardcoded | Ownership. Kids engage more when they name their own gestures. |
| Live sensor panel | Demystifies the AI. Numbers, not magic. Also serves as a design tool for choosing gestures. |
| One Arduino per student (no pairing) | Individual ownership of the full ML pipeline. No passenger students. |
| Friendly device names (SevernEdgeAI-8) | Classroom management. Kids find their board instantly. |
| Chrome-only (Web Bluetooth) | Only browser with BLE support. Acceptable tradeoff for a classroom setting. |
| 4-second recording window | Long enough to capture a full gesture, short enough for 10-year-old attention spans. |
| 25 Hz sampling | Good enough for gesture recognition, low enough for reliable BLE streaming. |

---

## Project Structure

```
severn-edge-ai/
├── firmware/                        # Arduino C++ code (PlatformIO)
│   ├── src/
│   │   ├── main.cpp                # BLE setup, main loop, device naming with lookup table
│   │   ├── config.h                # All constants + device-to-number mapping (20 boards)
│   │   ├── simple_nn.cpp/h         # Hand-written NN: matmul, ReLU, softmax
│   │   ├── inference.cpp/h         # Sliding window, normalization pipeline
│   │   ├── flash_storage.cpp/h     # Persist model weights across reboots
│   │   ├── sensor_bmi270.cpp       # BMI270 IMU driver (Rev2 boards)
│   │   ├── sensor_lsm9ds1.cpp      # LSM9DS1 IMU driver (Rev1 boards)
│   │   └── sensor_reader.h         # Sensor abstraction interface
│   ├── platformio.ini              # Build configuration
│   └── docs/
│       └── NEURAL_NETWORK_BASICS.md
│
├── web-app/                         # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx                 # Wizard flow state machine
│   │   ├── pages/
│   │   │   ├── ConnectPage.tsx     # BLE pairing
│   │   │   ├── CollectPage.tsx     # Two-phase: gesture setup → recording
│   │   │   │                       #   Contains: GesturePill, SensorPeek components
│   │   │   ├── TrainPage.tsx       # TF.js training + BLE model upload
│   │   │   └── TestPage.tsx        # Live inference display
│   │   ├── services/
│   │   │   ├── bleService.ts       # BLE connection, packet handling
│   │   │   ├── bleParser.ts        # Binary packet parsing (int16, CRC-8)
│   │   │   ├── trainingService.ts  # TensorFlow.js model creation + training
│   │   │   ├── modelExportService.ts    # Convert TF model → SimpleNN binary format
│   │   │   └── bleModelUploadService.ts # Chunked OTA upload with CRC validation
│   │   ├── config/
│   │   │   └── constants.ts        # Shared constants (MUST match firmware)
│   │   ├── components/
│   │   │   └── KidFeedback.tsx     # Celebratory recording feedback
│   │   └── types/
│   │       ├── ble.ts              # BLE packet type definitions
│   │       └── index.ts            # GestureLabel, Sample, AppStage, etc.
│   └── package.json
│
├── docs/
│   ├── CLASSROOM_GUIDE.md          # 3-hour lesson plan (the teaching plan above)
│   ├── CLASSROOM_GUIDE.pdf         # Printable version
│   └── AI_CONTEXT.md               # This file
│
├── README.md                        # Project overview + quick start
└── CLAUDE.md                        # AI assistant development context
```

---

## Device Fleet

20 Arduino Nano 33 BLE Sense boards are mapped to classroom numbers in `firmware/src/config.h`:

```
SevernEdgeAI-1 through SevernEdgeAI-20
```

Each board's nRF52840 chip has a unique hardware ID. The firmware reads it at boot, looks it up in the mapping table, and sets the BLE advertised name. Unknown boards fall back to the hex ID (e.g. `SevernEdgeAI-A1B2`).

Same firmware binary is flashed to all boards. Each resolves its own name.

---

## Hardware Details

| Board Variant | IMU Sensor | Auto-Detected |
|--------------|-----------|---------------|
| Rev1 (older) | LSM9DS1 | Yes, at runtime |
| Rev2 (newer) | BMI270 | Yes, at runtime |

- **MCU:** nRF52840 (ARM Cortex-M4F, 64 MHz, 256 KB RAM, 1 MB flash)
- **Power LED:** Green (not orange — orange is the pin 13 built-in LED)
- **BLE:** Built-in, advertising as `SevernEdgeAI-N`
- **Model storage:** ~78 KB in flash, persists across reboots

---

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Board not in Bluetooth dialog | USB not connected, or board needs power cycle | Unplug/replug USB, refresh Chrome |
| BLE shows old name after firmware update | Chrome caches BLE names | Close all Chrome tabs, power cycle board |
| Model always predicts same class | Normalization mismatch between web app and firmware | Verify constants match in both config files |
| Training accuracy stays low | Gestures too similar, or not enough samples | Collect more data, pick sensor-distinct gestures |
| Model upload fails mid-transfer | BLE connection dropped | Stay within 30 feet, retry upload |
| Inference is slow/laggy | Normal — predictions every ~1 second | `WINDOW_STRIDE=25` means 1 sec between predictions at 25Hz |

---

## Educational ML Concepts Taught (Implicitly)

Students learn these concepts through hands-on experience without formal definitions:

| ML Concept | How Students Experience It |
|-----------|--------------------------|
| **Feature space** | The 6 sensor axes ARE the features. Sensor panel makes them visible. |
| **Feature relevance** | Sensor challenges show which axes matter for which gestures |
| **Data quality** | Consistent recording → high accuracy. Sloppy recording → low accuracy. |
| **Overfitting** | The Stranger Test: model works for trainer but not for partner |
| **Generalization** | Stranger Test score measures exactly this |
| **Class boundaries** | Similar gestures confuse the AI — "the AI needs to tell things apart" |
| **Adversarial examples** | "Fool the AI" bonus contest |
| **Training vs inference** | They do both: train in browser, inference on Arduino |
| **Model deployment** | Physical act of uploading weights to hardware |
| **Sampling rate** | "25 times per second" — directly visible in the sensor panel |

---

## Builder Context

Built by **Solomon Kembo** (s.kembo@severnschool.com), Technology Coordinator at Severn School. This is a classroom tool used in actual lessons, not a demo project. The 20-board fleet, the friendly naming, the sensor challenges, the contest structure — all designed from real classroom experience with 10-year-olds.

Part of a broader research interest in edge AI and IoT education (see the root `CLAUDE.md` for the full baeIoT ecosystem context, which is a separate research project).
