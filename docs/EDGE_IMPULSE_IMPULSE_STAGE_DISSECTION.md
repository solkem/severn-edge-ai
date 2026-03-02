# Edge Impulse "Create impulse" Stage — Dissection Notes

This note dissects the **Impulse design / Create impulse** screen from Edge Impulse and maps what it implies for Severn Edge AI.

## 1) What this stage is doing

The impulse stage is a **pipeline builder** for time-series ML:

1. Define how raw sensor streams are chunked (window + stride + sampling rate),
2. Define how chunks are transformed into features (processing block),
3. Define how features are learned/classified (learning block),
4. Validate resulting feature/output dimensions before training.

In practice: this page sets the model's input contract *before* any training run.

## 2) Block-by-block analysis of the screenshot

### A) Time series data (red block)

Fields shown:
- Input axes: `accX, accY, accZ, gyrX, gyrY, gyrZ` (6 channels)
- Window size: `2000 ms`
- Window increase (stride): `200 ms`
- Frequency: `62.5 Hz`
- Zero-pad data: enabled

What this means:
- **Window size** controls temporal context per example.
- **Stride** controls overlap and therefore dataset expansion.
- **Frequency** determines samples per second and interacts directly with memory/compute.
- **Zero-padding** allows fixed-size tensors when captures do not perfectly fit window boundaries.

Quick derived math from shown values:
- Samples per window: `2.0 s * 62.5 Hz = 125` samples/channel.
- Raw values per window: `125 * 6 = 750` values.
- Step interval: `0.2 s` (high overlap), which improves event coverage but increases near-duplicate windows.

### B) Spectral Analysis (processing block)

The processing block converts raw windows into engineered features (typically frequency-domain descriptors).

Signals from UI:
- It can select per-axis participation (all 6 axes checked).
- It names the feature extraction stage (`Spectral features`).

Implication:
- Edge Impulse separates **signal processing decisions** from classifier decisions. This makes experimentation easier (swap DSP without replacing downstream orchestration).

### C) Classification (learning block)

The learning block consumes selected processing outputs and predicts labels.

Signals from UI:
- Input features explicitly references the processing block output.
- Output features shows class count (`1 (wave)` in screenshot).

Implication:
- The interface makes feature flow explicit, reducing "hidden" coupling.
- Output feature count is surfaced early so users can detect broken label setup before training.

### D) Output features card + Save Impulse

This card acts as a preflight summary:
- Are there valid outputs?
- Do block connections resolve?

The `Save Impulse` CTA indicates this stage defines a reusable pipeline configuration, not just temporary UI state.

## 3) Borrow the best, do not copy verbatim

We should **reuse the principles** behind this stage, while adapting the UX and terminology for Severn's classroom-first constraints.

### Principles to borrow

1. **Pipeline visibility**
   - Keep the path from raw data -> features -> classifier explicit.
2. **High-impact controls first**
   - Prioritize window, stride/overlap, and sampling rate.
3. **Contract transparency**
   - Always show derived dimensions and class counts.
4. **Preflight checks**
   - Validate obvious blockers before expensive steps.

### What not to copy directly

- Edge Impulse's exact card layout, labels, and visual styling.
- Controls that add expert complexity without student benefit.
- Any flow assumptions that depend on Edge Impulse backend behaviors.

### Severn-specific adaptation constraints

- Keep language readable for student users.
- Preserve compatibility with our BLE + firmware model format.
- Minimize decision overload in short classroom sessions.
- Prefer sensible presets and guardrails over unlimited tuning.

## 4) Risks/foot-guns this UI pattern prevents

- Mismatched sampling assumptions between capture and training.
- Incompatible feature dimensions between processing and classifier.
- Training on too-short context windows.
- Silent class-count problems (e.g., not enough labels).

## 5) Mapping to Severn Edge AI (current architecture)

Where equivalent concerns already live:
- Web constants/config: `web-app/src/config/constants.ts`
- Training/input prep: `web-app/src/services/trainingService.ts`
- Export contract: `web-app/src/services/modelExportService.ts`
- Firmware inference assumptions: `firmware/src/config.h`, `firmware/src/inference.cpp`

Design takeaway for us:
- Expose an explicit "impulse contract" panel in-app showing:
  - sampling rate,
  - window length,
  - overlap/stride,
  - derived input tensor shape,
  - number of classes,
  - and compatibility status with firmware/export constraints.

## 6) Concrete implementation ideas for our app

1. Add a **Model Input Contract** card in `Train`:
   - `window_ms`, `hz`, `channels`, `samples_per_window`, `input_length`.
2. Add a **Stride/overlap control** in `Collect` with sensible presets.
3. Add **feature pipeline labels** (Raw -> Features -> Classifier) to reduce black-box feel.
4. Add a **preflight validator** before training/export:
   - class count > 1,
   - minimum samples per class,
   - train/test split health,
   - firmware size compatibility.
5. Save these settings into session persistence for reproducibility.

## 7) Questions to validate in next screenshot/recording pass

- What exact feature vector size does Edge Impulse compute for this spectral block?
- How does zero-padding affect training vs inference consistency?
- Are stride/window constraints enforced or only warned?
- Which settings are locked once training artifacts exist?

## Bottom line

This stage is the heart of Edge Impulse's "from sensor stream to deployable model" workflow. The right move for Severn is to **borrow the best interaction principles** (clarity, constraints, preflight feedback), while implementing them in a simpler, classroom-optimized experience.
