/**
 * API pricing for cost estimation
 * Prices in USD per unit (tokens in millions, searches in thousands)
 */

import type { ProviderStep } from './providers';

// Provider pricing by step
export const PRICING = {
  anthropic: {
    search: { perRequest: 0.01 },  // Via Sonnet web_search tool
    curation: { model: 'claude-haiku-4-5', inputPer1M: 0.80, outputPer1M: 4 },
    synthesis: { model: 'claude-sonnet-4-5', inputPer1M: 3, outputPer1M: 15 },
  },
  serper: {
    search: { perRequest: 0.001 },  // $1/1k (2500 free)
  },
  perplexity: {
    search: { perRequest: 0.005 },  // ~$5/1k
    synthesis: { model: 'sonar-pro', inputPer1M: 3, outputPer1M: 15 },
  },
  deepseek: {
    curation: { model: 'deepseek-chat', inputPer1M: 0.14, outputPer1M: 0.28 },
    synthesis: { model: 'deepseek-chat', inputPer1M: 0.14, outputPer1M: 0.28 },
  },
  gemini: {
    curation: { model: 'gemini-2.0-flash-lite', inputPer1M: 0.075, outputPer1M: 0.30 },
    synthesis: { model: 'gemini-2.0-flash', inputPer1M: 0.10, outputPer1M: 0.40 },
  },
} as const;

export type ProviderId = keyof typeof PRICING;

/**
 * Calculate search cost
 */
export function calculateSearchCost(provider: ProviderId, requestCount: number): number {
  const pricing = PRICING[provider];
  if (!('search' in pricing)) return 0;
  return requestCount * pricing.search.perRequest;
}

/**
 * Calculate LLM cost for curation or synthesis
 */
export function calculateLLMCost(
  provider: ProviderId,
  step: 'curation' | 'synthesis',
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[provider];
  if (!(step in pricing)) return 0;
  const stepPricing = pricing[step as keyof typeof pricing] as { inputPer1M: number; outputPer1M: number };
  return (inputTokens * stepPricing.inputPer1M + outputTokens * stepPricing.outputPer1M) / 1_000_000;
}

/**
 * Estimate total diff cost based on provider selections
 */
export function estimateDiffCost(selections: {
  search?: ProviderId | null;
  curation?: ProviderId | null;
  synthesis?: ProviderId | null;
}): { min: number; max: number; breakdown: string[] } {
  const breakdown: string[] = [];
  let min = 0;
  let max = 0;

  // Search: ~5 requests typical
  if (selections.search) {
    const cost = calculateSearchCost(selections.search, 5);
    min += cost;
    max += cost;
    breakdown.push(`Search (${selections.search}): ~$${cost.toFixed(4)}`);
  }

  // Curation: ~500 input, ~100 output tokens typical
  if (selections.curation) {
    const cost = calculateLLMCost(selections.curation, 'curation', 500, 100);
    min += cost;
    max += cost * 2;
    breakdown.push(`Curation (${selections.curation}): ~$${cost.toFixed(4)}`);
  }

  // Synthesis: ~2000 input, ~2000-8000 output tokens depending on depth
  if (selections.synthesis) {
    const minCost = calculateLLMCost(selections.synthesis, 'synthesis', 2000, 2000);
    const maxCost = calculateLLMCost(selections.synthesis, 'synthesis', 4000, 8000);
    min += minCost;
    max += maxCost;
    breakdown.push(`Synthesis (${selections.synthesis}): $${minCost.toFixed(4)}-${maxCost.toFixed(4)}`);
  }

  return { min, max, breakdown };
}
