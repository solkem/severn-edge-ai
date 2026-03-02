import { describe, expect, it } from 'vitest';
import { resolveSamplesPerGestureGoal } from './CollectPage';

describe('resolveSamplesPerGestureGoal', () => {
  it('always uses configured training default for train split', () => {
    expect(resolveSamplesPerGestureGoal('train', false)).toBe(15);
    expect(resolveSamplesPerGestureGoal('train', true, 20)).toBe(15);
  });

  it('uses explicit required sample goal for test split when provided', () => {
    expect(resolveSamplesPerGestureGoal('test', true, 3)).toBe(3);
  });

  it('falls back to append-mode test default when no override is provided', () => {
    expect(resolveSamplesPerGestureGoal('test', true)).toBe(3);
  });
});
