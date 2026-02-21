import type { BadgeId } from '../storage/schema';

export interface BadgeDefinition {
  id: BadgeId;
  icon: string;
  name: string;
  criteria: string;
}

export const BADGES: Record<BadgeId, BadgeDefinition> = {
  connected: {
    id: 'connected',
    icon: '🔌',
    name: 'Connected',
    criteria: 'Successfully paired with Arduino',
  },
  'sensor-explorer': {
    id: 'sensor-explorer',
    icon: '🔍',
    name: 'Sensor Explorer',
    criteria: 'Passed the sensor concept gate',
  },
  designer: {
    id: 'designer',
    icon: '🎨',
    name: 'Designer',
    criteria: 'Passed the gesture design gate',
  },
  'data-scientist': {
    id: 'data-scientist',
    icon: '📊',
    name: 'Data Scientist',
    criteria: 'Collected strong training data',
  },
  'ai-trainer': {
    id: 'ai-trainer',
    icon: '🧠',
    name: 'AI Trainer',
    criteria: 'Reached 80%+ training accuracy',
  },
  'edge-engineer': {
    id: 'edge-engineer',
    icon: '🚀',
    name: 'Edge Engineer',
    criteria: 'Deployed model to Arduino',
  },
  'sharp-shooter': {
    id: 'sharp-shooter',
    icon: '🎯',
    name: 'Sharp Shooter',
    criteria: '10 high-confidence predictions',
  },
};

