import type { BadgeId, CheckpointId } from '../storage/schema';

export interface KnowledgeCheck {
  id: CheckpointId;
  question: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
  badgeOnPass?: BadgeId;
}

export const KNOWLEDGE_CHECKS: Record<CheckpointId, KnowledgeCheck> = {
  'gate-1-sensor': {
    id: 'gate-1-sensor',
    question:
      'Which sensor measures how quickly you rotate the board (spin/turn rate)?',
    options: [
      { text: 'Accelerometer', correct: false },
      { text: 'Gyroscope', correct: true },
      { text: 'Battery monitor', correct: false },
    ],
    explanation:
      'The gyroscope tracks rotational speed (gx, gy, gz). The accelerometer tracks linear movement and gravity.',
    badgeOnPass: 'sensor-explorer',
  },
  'gate-2-gesture': {
    id: 'gate-2-gesture',
    question:
      'Why should your gestures create different sensor patterns from each other?',
    options: [
      { text: 'So the AI can tell classes apart', correct: true },
      { text: 'So upload is faster', correct: false },
      { text: 'So colors look better', correct: false },
    ],
    explanation:
      "If two gestures look the same numerically, the model can't reliably distinguish them.",
    badgeOnPass: 'designer',
  },
  'gate-3-confidence': {
    id: 'gate-3-confidence',
    question: 'What does a low confidence score usually mean?',
    options: [
      { text: 'The model is uncertain or inputs are ambiguous', correct: true },
      { text: 'Bluetooth is disconnected', correct: false },
      { text: 'The battery is low', correct: false },
    ],
    explanation:
      'Low confidence often means your training data overlaps too much or your live gesture does not match training examples.',
  },
  'gate-4-edge-ai': {
    id: 'gate-4-edge-ai',
    question: 'What makes this an Edge AI project?',
    options: [
      { text: 'The model runs on the Arduino device', correct: true },
      { text: 'All predictions happen only in the cloud', correct: false },
      { text: 'It works only when Wi-Fi is strong', correct: false },
    ],
    explanation:
      'Edge AI means inference runs on the device itself, close to the sensor input.',
  },
};
