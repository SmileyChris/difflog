/**
 * API pricing for cost estimation
 * Prices in USD per unit (tokens in millions, searches in thousands)
 */

import { resolveModel } from './providers';
import type { ProviderStep } from './providers';

// Model pricing (USD per 1M tokens). Deprecated entries retained so legacy
// profiles continue to get accurate estimates until users opt to update.
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Anthropic
  'claude-haiku-4-5':     { inputPer1M: 1,   outputPer1M: 5 },
  'claude-sonnet-4-6':    { inputPer1M: 3,   outputPer1M: 15 },
  'claude-sonnet-4-5':    { inputPer1M: 3,   outputPer1M: 15 },   // legacy
  'claude-opus-4-7':      { inputPer1M: 5,   outputPer1M: 25 },
  // DeepSeek
  'deepseek-v4-flash':    { inputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-v4-pro':      { inputPer1M: 1.74, outputPer1M: 3.48 },  // undiscounted
  'deepseek-chat':        { inputPer1M: 0.14, outputPer1M: 0.28 },  // legacy
  // Gemini
  'gemini-3.1-flash-lite': { inputPer1M: 0.25, outputPer1M: 1.50 },
  'gemini-3-flash':        { inputPer1M: 0.50, outputPer1M: 3.00 },
  'gemini-3.1-pro':        { inputPer1M: 2.00, outputPer1M: 12.00 },
  'gemini-2.5-flash':      { inputPer1M: 0.15, outputPer1M: 0.60 },  // legacy
  // Perplexity
  'sonar':                { inputPer1M: 1,   outputPer1M: 5 },
  'sonar-pro':            { inputPer1M: 3,   outputPer1M: 15 },
  'sonar-reasoning-pro':  { inputPer1M: 3,   outputPer1M: 15 },
};

// Provider search pricing
const SEARCH_PRICING: Record<string, { perRequest: number }> = {
  serper:     { perRequest: 0.001 },  // $1/1k (2500 free)
  perplexity: { perRequest: 0.005 },  // ~$5/1k
  anthropic:  { perRequest: 0.01 },   // Via Sonnet web_search tool
};

/**
 * Calculate search cost
 */
export function calculateSearchCost(provider: string, requestCount: number): number {
  const pricing = SEARCH_PRICING[provider];
  if (!pricing) return 0;
  return requestCount * pricing.perRequest;
}

/**
 * Look up token pricing for a model.
 */
export function getModelPricing(model: string): { inputPer1M: number; outputPer1M: number } | null {
  return MODEL_PRICING[model] ?? null;
}

/**
 * Typical token usage per step, used for cost previews next to model options.
 */
export const TYPICAL_USAGE: Record<ProviderStep, { input: number; output: number }> = {
  search: { input: 0, output: 0 },
  curation: { input: 500, output: 100 },
  synthesis: { input: 3000, output: 5000 },
};

/**
 * Estimate per-diff cost for a single model used at a given step.
 */
export function estimateModelStepCost(model: string, step: ProviderStep): number {
  const u = TYPICAL_USAGE[step];
  return calculateLLMCost(model, u.input, u.output);
}

/**
 * Calculate LLM cost for a given model
 */
export function calculateLLMCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}

/**
 * Estimate total diff cost based on provider selections and optional model overrides
 */
export function estimateDiffCost(selections: {
  search?: string | null;
  curation?: string | null;
  synthesis?: string | null;
}, models?: {
  search?: string | null;
  curation?: string | null;
  synthesis?: string | null;
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
    const model = resolveModel(selections.curation, 'curation', models);
    if (model) {
      const cost = calculateLLMCost(model, 500, 100);
      min += cost;
      max += cost * 2;
      breakdown.push(`Curation (${model}): ~$${cost.toFixed(4)}`);
    }
  }

  // Synthesis: ~2000 input, ~2000-8000 output tokens depending on depth
  if (selections.synthesis) {
    const model = resolveModel(selections.synthesis, 'synthesis', models);
    if (model) {
      const minCost = calculateLLMCost(model, 2000, 2000);
      const maxCost = calculateLLMCost(model, 4000, 8000);
      min += minCost;
      max += maxCost;
      breakdown.push(`Synthesis (${model}): $${minCost.toFixed(4)}-${maxCost.toFixed(4)}`);
    }
  }

  return { min, max, breakdown };
}
