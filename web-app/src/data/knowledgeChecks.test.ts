import { describe, expect, it } from 'vitest';
import {
  getKnowledgeCheckForGate,
  KNOWLEDGE_CHECK_POOLS,
} from './knowledgeChecks';

describe('knowledgeChecks', () => {
  it('defines the required four gate pools', () => {
    expect(Object.keys(KNOWLEDGE_CHECK_POOLS).sort()).toEqual([
      'gate-1-sensor',
      'gate-2-gesture',
      'gate-3-confidence',
      'gate-4-edge-ai',
    ]);
  });

  it('has at least three variants per gate and one correct option per variant', () => {
    for (const pool of Object.values(KNOWLEDGE_CHECK_POOLS)) {
      expect(pool.variants.length).toBeGreaterThanOrEqual(3);
      for (const variant of pool.variants) {
        const correctCount = variant.options.filter((option) => option.correct).length;
        expect(correctCount).toBe(1);
      }
    }
  });

  it('creates runtime checks that map back to the correct gate id', () => {
    const gateIds = Object.keys(KNOWLEDGE_CHECK_POOLS) as Array<
      keyof typeof KNOWLEDGE_CHECK_POOLS
    >;
    for (const gateId of gateIds) {
      const check = getKnowledgeCheckForGate(gateId);
      expect(check.id).toBe(gateId);
      expect(check.options.length).toBeGreaterThanOrEqual(3);
    }
  });
});
