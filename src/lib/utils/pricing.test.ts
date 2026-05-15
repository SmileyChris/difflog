import { expect, test, describe } from 'bun:test';
import {
  calculateSearchCost,
  calculateLLMCost,
  estimateDiffCost,
  estimateModelStepCost,
  getModelPricing,
} from './pricing';

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
    test('haiku 4.5', () => {
      const cost = calculateLLMCost('claude-haiku-4-5', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(1 + 5);
    });

    test('deepseek v4 flash', () => {
      const cost = calculateLLMCost('deepseek-v4-flash', 500_000, 500_000);
      expect(cost).toBeCloseTo((0.14 + 0.28) / 2);
    });

    test('unknown model returns 0', () => {
      expect(calculateLLMCost('made-up-model', 1000, 1000)).toBe(0);
    });
  });

  describe('getModelPricing', () => {
    test('known model', () => {
      const p = getModelPricing('claude-sonnet-4-6');
      expect(p?.inputPer1M).toBe(3);
      expect(p?.outputPer1M).toBe(15);
    });

    test('unknown model returns null', () => {
      expect(getModelPricing('does-not-exist')).toBeNull();
    });
  });

  describe('estimateModelStepCost', () => {
    test('synthesis uses larger token bucket than curation', () => {
      const synth = estimateModelStepCost('claude-sonnet-4-6', 'synthesis');
      const cur = estimateModelStepCost('claude-sonnet-4-6', 'curation');
      expect(synth).toBeGreaterThan(cur);
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

    test('model override changes cost', () => {
      const baseline = estimateDiffCost({ synthesis: 'anthropic' });
      const opus = estimateDiffCost(
        { synthesis: 'anthropic' },
        { synthesis: 'claude-opus-4-7' },
      );
      expect(opus.min).toBeGreaterThan(baseline.min);
    });
  });
});
