import type { BadgeId, CheckpointId } from '../storage/schema';

export interface KnowledgeOption {
  text: string;
  correct: boolean;
}

export interface KnowledgeCheckVariant {
  question: string;
  options: KnowledgeOption[];
  explanation: string;
}

export interface KnowledgeCheck {
  id: CheckpointId;
  question: string;
  options: KnowledgeOption[];
  explanation: string;
  badgeOnPass?: BadgeId;
}

export interface KnowledgeCheckPool {
  id: CheckpointId;
  variants: KnowledgeCheckVariant[];
  badgeOnPass?: BadgeId;
}

const lastVariantByGate: Partial<Record<CheckpointId, number>> = {};

function pickVariantIndex(gateId: CheckpointId, count: number): number {
  if (count <= 1) return 0;
  const lastIdx = lastVariantByGate[gateId];
  let idx = Math.floor(Math.random() * count);
  if (lastIdx !== undefined && idx === lastIdx) {
    idx = (idx + 1 + Math.floor(Math.random() * (count - 1))) % count;
  }
  lastVariantByGate[gateId] = idx;
  return idx;
}

function cloneOptions(options: KnowledgeOption[]): KnowledgeOption[] {
  return options.map((option) => ({ ...option }));
}

export const KNOWLEDGE_CHECK_POOLS: Record<CheckpointId, KnowledgeCheckPool> = {
  'gate-1-sensor': {
    id: 'gate-1-sensor',
    badgeOnPass: 'sensor-explorer',
    variants: [
      {
        question: 'Which sensor tells us turn or spin speed?',
        options: [
          { text: 'Gyroscope', correct: true },
          { text: 'Accelerometer', correct: false },
          { text: 'Battery meter', correct: false },
        ],
        explanation:
          'Gyroscope values (gx, gy, gz) track rotational speed when the board turns.',
      },
      {
        question: 'When you rotate the board, which numbers should change most?',
        options: [
          { text: 'gx, gy, gz', correct: true },
          { text: 'ax, ay, az only', correct: false },
          { text: 'Firmware version numbers', correct: false },
        ],
        explanation:
          'Rotation is measured by the gyroscope channels gx, gy, and gz.',
      },
      {
        question: 'Which sensor mostly measures linear motion and gravity?',
        options: [
          { text: 'Accelerometer', correct: true },
          { text: 'Gyroscope', correct: false },
          { text: 'Model confidence', correct: false },
        ],
        explanation:
          'The accelerometer (ax, ay, az) captures movement and gravity direction.',
      },
      {
        question: 'If you spin fast, which sensor is the best clue for the model?',
        options: [
          { text: 'Gyroscope', correct: true },
          { text: 'Wi-Fi status', correct: false },
          { text: 'Battery percentage', correct: false },
        ],
        explanation:
          'Spin speed is rotational data, and rotational data comes from the gyroscope.',
      },
    ],
  },
  'gate-2-gesture': {
    id: 'gate-2-gesture',
    badgeOnPass: 'designer',
    variants: [
      {
        question: 'Why should your gesture classes look different in sensor data?',
        options: [
          { text: 'So the model can tell classes apart', correct: true },
          { text: 'So BLE upload is faster', correct: false },
          { text: 'So the app theme changes color', correct: false },
        ],
        explanation:
          'If patterns overlap too much, the model cannot reliably separate the classes.',
      },
      {
        question: 'Two gestures make almost the same graph. What is likely to happen?',
        options: [
          { text: 'The model may confuse them', correct: true },
          { text: 'The battery gets full', correct: false },
          { text: 'The model gets smaller', correct: false },
        ],
        explanation:
          'Similar patterns are hard to classify, so confusion increases.',
      },
      {
        question: 'Which choice helps the model learn faster and better?',
        options: [
          { text: 'Repeat clear, consistent motions', correct: true },
          { text: 'Use random motions each sample', correct: false },
          { text: 'Skip collecting samples', correct: false },
        ],
        explanation:
          'Consistent samples create clean patterns that are easier to learn.',
      },
      {
        question: 'Best plan for gesture quality is to make each class...',
        options: [
          { text: 'Distinct and repeatable', correct: true },
          { text: 'As similar as possible', correct: false },
          { text: 'Different only one time', correct: false },
        ],
        explanation:
          'Distinct + repeatable data improves model separation and confidence.',
      },
    ],
  },
  'gate-3-confidence': {
    id: 'gate-3-confidence',
    variants: [
      {
        question: 'What does a low confidence score usually mean?',
        options: [
          { text: 'The model is not very sure', correct: true },
          { text: 'Bluetooth is always disconnected', correct: false },
          { text: 'The board has no battery', correct: false },
        ],
        explanation:
          'Low confidence usually means uncertain input or overlapping class patterns.',
      },
      {
        question: 'If confidence is 35%, what should you assume first?',
        options: [
          { text: 'Prediction may be unreliable', correct: true },
          { text: 'Model is perfectly certain', correct: false },
          { text: 'Upload definitely failed', correct: false },
        ],
        explanation:
          'A low value means weak certainty, so the guess may be wrong.',
      },
      {
        question: 'What does a high confidence score (like 95%) suggest?',
        options: [
          { text: 'The model strongly favors one class', correct: true },
          { text: 'No model is loaded', correct: false },
          { text: 'Sensor data stopped', correct: false },
        ],
        explanation:
          'High confidence means one class has a much stronger probability than others.',
      },
      {
        question: 'Low confidence can often be improved by...',
        options: [
          { text: 'Collecting cleaner and more distinct samples', correct: true },
          { text: 'Closing the app immediately', correct: false },
          { text: 'Changing only the student name', correct: false },
        ],
        explanation:
          'Better training examples usually improve class separation and confidence.',
      },
    ],
  },
  'gate-4-edge-ai': {
    id: 'gate-4-edge-ai',
    variants: [
      {
        question: 'What makes this an Edge AI project?',
        options: [
          { text: 'The model runs on the Arduino device', correct: true },
          { text: 'All predictions happen only in the cloud', correct: false },
          { text: 'It only works with strong Wi-Fi', correct: false },
        ],
        explanation:
          'Edge AI runs inference on the device near the sensor, not only on remote servers.',
      },
      {
        question: 'In this app, where is live inference computed?',
        options: [
          { text: 'On the Arduino', correct: true },
          { text: 'Only on a remote website server', correct: false },
          { text: 'Inside the USB cable', correct: false },
        ],
        explanation:
          'After upload, the Arduino executes the model and returns predictions.',
      },
      {
        question: 'Why is on-device inference called "edge"?',
        options: [
          { text: 'Computation happens at the device edge', correct: true },
          { text: 'Because the UI has rounded edges', correct: false },
          { text: 'Because confidence scores are sharp', correct: false },
        ],
        explanation:
          'The "edge" means near the data source device, not in a central cloud service.',
      },
      {
        question: 'Which setup is Edge AI here?',
        options: [
          { text: 'Train in browser, run predictions on Arduino', correct: true },
          { text: 'Train and predict only in cloud APIs', correct: false },
          { text: 'Predict by student voting', correct: false },
        ],
        explanation:
          'Training can happen on laptop, but edge inference happens on the board.',
      },
    ],
  },
};

export function getKnowledgeCheckForGate(checkpointId: CheckpointId): KnowledgeCheck {
  const pool = KNOWLEDGE_CHECK_POOLS[checkpointId];
  const variantIdx = pickVariantIndex(checkpointId, pool.variants.length);
  const variant = pool.variants[variantIdx];

  return {
    id: checkpointId,
    question: variant.question,
    options: cloneOptions(variant.options),
    explanation: variant.explanation,
    badgeOnPass: pool.badgeOnPass,
  };
}
