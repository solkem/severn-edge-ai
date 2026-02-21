import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_CHECKS } from './knowledgeChecks';

describe('knowledgeChecks', () => {
  it('defines the required three gates', () => {
    expect(Object.keys(KNOWLEDGE_CHECKS).sort()).toEqual([
      'gate-1-sensor',
      'gate-2-gesture',
      'gate-3-confidence',
    ]);
  });

  it('has exactly one correct option per gate', () => {
    for (const check of Object.values(KNOWLEDGE_CHECKS)) {
      const correctCount = check.options.filter((option) => option.correct).length;
      expect(correctCount).toBe(1);
    }
  });
});
