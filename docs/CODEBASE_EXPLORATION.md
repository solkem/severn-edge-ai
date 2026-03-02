# Codebase Exploration Notes

This document captures a quick technical orientation for the Severn Edge AI repo.

## 1) High-level structure

- `web-app/` — React + TypeScript client that runs the student workflow (connect, preview, collect, train, test, project brief, portfolio).
- `firmware/` — Arduino Nano 33 BLE Sense firmware for sensor streaming, model upload, and on-device inference.
- `docs/` — classroom guides, deployment/process docs, and spec/context references.

## 2) Web app map (`web-app/`)

### Runtime flow

The top-level application state machine is in `src/App.tsx` and orchestrates stage transitions:

`Connect -> Preview -> Collect -> Train -> Test -> Project Brief -> Portfolio`

It also wires:
- session persistence and recovery,
- reconnect behavior,
- checkpoint gates,
- and badge/engagement UI.

### State and persistence

- `src/state/sessionStore.ts` manages session data, samples, stage state, badges, checkpoints, and resume behavior.
- `src/state/connectionStore.ts` tracks BLE status/reconnect state.
- `src/storage/schema.ts` defines persistent contracts (`SessionMeta`, `PersistedSample`, `SessionBundle`, checkpoint IDs, badges, project brief).
- `src/storage/db.ts` implements IndexedDB access.

### Core services

- `src/services/bleService.ts` handles Web Bluetooth connection lifecycle, characteristic wiring, disconnect handling, and silent reconnect attempts.
- `src/services/bleParser.ts` decodes/validates sensor packets and CRC.
- `src/services/trainingService.ts` runs in-browser TensorFlow.js model training.
- `src/services/modelExportService.ts` converts trained model weights into the firmware-consumable SimpleNN layout.
- `src/services/bleModelUploadService.ts` uploads model chunks over BLE.

### Quality and tests

Vitest coverage exists across parsing, training, export, model arena/testing logic, stores, and utility functions under `src/**/*.test.ts`.

## 3) Firmware map (`firmware/`)

### Main firmware orchestration

`src/main.cpp` sets up:
- BLE service/characteristics,
- collection vs inference operating modes,
- model upload command handling,
- and periodic sensor/inference behavior.

It also derives a unique hardware ID and maps it to classroom-friendly device names (`SevernEdgeAI-N`) via lookup table.

### Configuration contract

`src/config.h` centralizes:
- UUIDs used by web + firmware,
- sensor scaling,
- sample/window config,
- neural network dimensions and max model size,
- device name mapping table.

This file is a key compatibility boundary with `web-app/src/config/constants.ts` and training/export assumptions.

### Inference path

`src/inference.cpp` implements a SimpleNN-based inference pipeline:
1. Collect normalized IMU samples into a sliding window,
2. flatten to model input,
3. run prediction,
4. apply confidence/motion stabilization (including idle-class behavior),
5. return class + confidence.

### Storage/upload support

- `src/flash_storage.cpp/h` validates and stores uploaded models.
- `src/simple_nn.cpp/h` implements the hand-written neural net runtime.

## 4) Notable integration boundaries

1. **BLE protocol compatibility**
   - UUIDs and packet layouts must remain synchronized across firmware (`config.h`) and web parsing/services.

2. **Normalization consistency**
   - Sensor scaling and normalization constants used in firmware inference must match web training preprocessing.

3. **Model binary format compatibility**
   - Export format from web model export service must match firmware SimpleNN/flash loader expectations.

## 5) Useful first commands

```bash
# Web app
npm --prefix web-app test
npm --prefix web-app run build

# Firmware
cd firmware
pio run
```

## 6) Suggested next deep-dive files

- `web-app/src/App.tsx`
- `web-app/src/services/bleService.ts`
- `web-app/src/services/trainingService.ts`
- `web-app/src/services/modelExportService.ts`
- `firmware/src/main.cpp`
- `firmware/src/inference.cpp`
- `firmware/src/config.h`

## 7) Edge Impulse reference notes

For product benchmarking against Edge Impulse, see:
- `docs/EDGE_IMPULSE_IMPULSE_STAGE_DISSECTION.md` — deep dive of the Impulse Design screen and how to borrow its best patterns (without copying verbatim) for Severn.
- `docs/EDGE_IMPULSE_TESTING_INFERENCE_DISSECTION.md` — focused analysis of model testing and live inference patterns to improve Severn accuracy and reliability.

