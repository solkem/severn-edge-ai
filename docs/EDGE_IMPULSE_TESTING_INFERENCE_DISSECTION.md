# Edge Impulse Testing / Inference Stage — Dissection for Severn

This note focuses on the part we most need to improve: **model testing and inference quality**.

Goal: learn from Edge Impulse patterns to make Severn testing less noisy, more trustworthy, and easier for students to act on.

## 1) What Edge Impulse gets right in testing/inference UX

From the product flow and screenshots, Edge Impulse treats testing as a first-class stage, not an afterthought. The key patterns are:

1. **Dedicated stage in the left-nav lifecycle**
   - Testing sits between training and deployment, which makes validation mandatory, not optional.

2. **Tight coupling of prediction + evidence**
   - Users can inspect raw signal context and outputs together instead of seeing only a final label.

3. **Progressive quality checks**
   - Data quality, train/test split health, and output sanity are surfaced before deployment.

4. **Live classification as a distinct verification mode**
   - Real-time inference is used to test behavior under motion and environmental variability.

## 2) Why our testing feels sub-standard/inaccurate (likely root causes)

Without changing code yet, the common failure modes for embedded motion classifiers are:

- **Data leakage / overlap leakage**
  - High overlap windows can place near-duplicate segments into both train and test.

- **Class imbalance and sparse labels**
  - Accuracy can look acceptable while minority classes fail.

- **Mismatch between offline and runtime preprocessing**
  - Different normalization/windowing between web training and firmware inference destabilizes results.

- **No confidence calibration or rejection policy**
  - Low-confidence predictions still shown as hard labels.

- **Weak per-class diagnostics**
  - Aggregate accuracy hides confusion between similar gestures.

- **Inadequate “unknown/idle” handling**
  - Real-world idle motion gets forced into nearest known class.

## 3) What to borrow from Edge Impulse (not verbatim)

### A) Treat testing as a gated stage

Before allowing model export/upload, require a compact preflight:
- minimum per-class sample count,
- minimum balanced split,
- per-class recall floor,
- confusion hotspots review.

### B) Add evidence-rich inference outputs

For each prediction in Test/Live modes, display:
- top-1 label + confidence,
- top-2 alternative,
- confidence margin (`top1 - top2`),
- short signal quality hint (e.g., saturation/no-motion/noise).

### C) Separate offline test vs live inference scorecards

- **Offline scorecard** (repeatable): confusion matrix, macro-F1, per-class recall.
- **Live scorecard** (behavioral): stability, latency, false-trigger rate, idle rejection rate.

### D) Add explicit uncertainty behavior

Introduce configurable inference states:
- `CONFIDENT_CLASS` when confidence + margin pass threshold,
- `UNSURE` when below threshold,
- `IDLE/UNKNOWN` when motion gate says no meaningful event.

### E) Show contract consistency checks

Display whether training and inference agree on:
- window length,
- stride,
- sensor axes/order,
- normalization constants,
- class map ordering.

## 4) Screenshot-driven reverse-engineering checklist (for future captures)

Screenshots can still help a lot if we capture testing states intentionally.

Ask for these **testing/inference screenshots**:
1. Model testing summary (overall metrics + confusion matrix)
2. Misclassification drill-down view
3. Live classification during good signal
4. Live classification during ambiguous/noisy signal
5. Any warning state (low data quality, class imbalance, etc.)

For each screenshot, annotate:
- what user action triggered this state,
- what metric changed,
- what decision the UI expects the user to make.

## 5) Concrete Severn implementation backlog (priority-ordered)

### P0 — Must-have reliability upgrades

1. **Per-class metrics in Test page**
   - macro-F1, per-class precision/recall, confusion matrix.
2. **Hard guardrail before "ready"**
   - block “ready to deploy” unless minimum per-class recall and sample counts are met.
3. **Confidence + margin thresholds in inference**
   - avoid hard label when uncertainty is high.
4. **Idle/unknown rejection policy**
   - reduce false triggers in classroom movement.

### P1 — High-impact UX upgrades

5. **Prediction evidence panel**
   - top-k probabilities + signal quality cue + recent prediction history.
6. **Live stability metric**
   - jitter score / prediction flip rate over recent window.
7. **Misclassification explorer**
   - quickly inspect examples the model confuses.

### P2 — Nice-to-have advanced controls

8. **Per-class threshold tuning UI**
9. **Calibration pass using held-out validation data**
10. **Export report card PDF for classroom assessment**

## 6) Mapping to current Severn code surfaces

- Testing pipeline service: `web-app/src/services/modelTestingService.ts`
- Arena/interaction testing: `web-app/src/services/modelArenaService.ts`
- Train page flow: `web-app/src/pages/TrainPage.tsx`
- Test page UX: `web-app/src/pages/TestPage.tsx`
- Session/test persistence: `web-app/src/state/sessionStore.ts`
- Runtime inference behavior: `firmware/src/inference.cpp`
- Contract constants: `web-app/src/config/constants.ts`, `firmware/src/config.h`

## 7) Immediate definition of done for "testing is no longer sub-standard"

A model should be considered classroom-ready only if:

1. It meets **minimum macro-F1** and **minimum per-class recall**,
2. It passes **idle false-trigger** threshold in live test,
3. It reports **UNSURE** instead of hard class when confidence is low,
4. It passes **contract consistency checks** (training vs firmware),
5. It produces a **transparent test summary** understandable by students.

## Bottom line

Yes, screenshots help us learn this stage — especially if we capture test/inference states deliberately.

The biggest lesson from Edge Impulse is not a specific UI component. It's the product discipline: **make testing evidence-rich, gated, and inseparable from deployment**.


## 8) What the “last two screenshots” likely show (and why it works so well)

Based on common Edge Impulse testing layouts, the radically effective pattern is usually this pair:

1. **Live stream + confidence behavior view**
   - Not just “predicted class now”, but confidence behavior over time and stability under real motion.
   - This catches jitter, overconfident wrong predictions, and false triggers that static test sets miss.

2. **Error analysis drill-down view**
   - Misclassifications are inspectable examples, not just a single aggregate score.
   - Teams can identify *which* gestures collide, then collect targeted new samples.

Why this combination is powerful:
- It combines **population-level metrics** (offline) with **behavior-under-motion metrics** (live).
- It turns testing from a grade into a **debugging loop**.
- It makes “uncertain” behavior visible, which prevents over-trusting weak predictions.

### Severn adaptation we should keep
- Keep objective locked-test scoring, but add uncertainty/stability readouts.
- Keep per-class metrics, but make error examples easy to inspect and act on.
- Keep classroom-friendly language: “confident vs uncertain” instead of advanced calibration terms.

