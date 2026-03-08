import { expect, test, describe } from 'bun:test';
import { calculateSearchCost, calculateLLMCost, estimateDiffCost, PRICING } from './pricing';

describe('pricing.ts', () => {
  describe('calculateSearchCost', () => {
    test('serper', () => {
      expect(calculateSearchCost('serper', 5)).toBeCloseTo(0.005);
    });

    test('anthropic', () => {
      expect(calculateSearchCost('anthropic', 5)).toBeCloseTo(0.05);
    });

    test('perplexity', () => {
      expect(calculateSearchCost('perplexity', 5)).toBeCloseTo(0.025);
    });

    test('provider without search returns 0', () => {
      expect(calculateSearchCost('deepseek', 5)).toBe(0);
      expect(calculateSearchCost('gemini', 5)).toBe(0);
    });
  });

  describe('calculateLLMCost', () => {
    test('curation step', () => {
      // anthropic curation: haiku — $0.80 input, $4 output per 1M
      const cost = calculateLLMCost('anthropic', 'curation', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(0.80 + 4);
    });

    test('synthesis step', () => {
      // deepseek: $0.14 input, $0.28 output per 1M
      const cost = calculateLLMCost('deepseek', 'synthesis', 500_000, 500_000);
      expect(cost).toBeCloseTo((0.14 + 0.28) / 2);
    });

    test('provider without step returns 0', () => {
      expect(calculateLLMCost('serper', 'curation', 1000, 1000)).toBe(0);
      expect(calculateLLMCost('perplexity', 'curation', 1000, 1000)).toBe(0);
    });
  });

  describe('estimateDiffCost', () => {
    test('all providers selected → full breakdown', () => {
      const result = estimateDiffCost({
        search: 'serper',
        curation: 'anthropic',
        synthesis: 'anthropic',
      });
      expect(result.min).toBeGreaterThan(0);
      expect(result.max).toBeGreaterThanOrEqual(result.min);
      expect(result.breakdown).toHaveLength(3);
    });

    test('no providers → zero cost', () => {
      const result = estimateDiffCost({});
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });

    test('partial selections', () => {
      const result = estimateDiffCost({ synthesis: 'gemini' });
      expect(result.min).toBeGreaterThan(0);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0]).toContain('gemini');
    });
  });
});
