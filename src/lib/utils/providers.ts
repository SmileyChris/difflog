/**
 * Provider capabilities and configuration
 */

import type { ProviderSelections } from '../types/sync';

export type ProviderStep = 'search' | 'curation' | 'synthesis';

export interface ProviderConfig {
  id: string;
  name: string;
  label: string;  // CLI-friendly display name (e.g. "Anthropic (Claude)")
  capabilities: ProviderStep[];
  keyPlaceholder: string;
  keyPrefix?: string;  // For validation hint (e.g., "sk-ant-")
  docsUrl?: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    label: 'Anthropic (Claude)',
    capabilities: ['search', 'curation', 'synthesis'],
    keyPlaceholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com/',
  },
  serper: {
    id: 'serper',
    name: 'Serper',
    label: 'Serper (web search)',
    capabilities: ['search'],
    keyPlaceholder: 'API key',
    docsUrl: 'https://serper.dev/api-keys',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    label: 'Perplexity',
    capabilities: ['search', 'synthesis'],
    keyPlaceholder: 'pplx-...',
    keyPrefix: 'pplx-',
    docsUrl: 'https://www.perplexity.ai/settings/api',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    label: 'DeepSeek',
    capabilities: ['curation', 'synthesis'],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    label: 'Google Gemini',
    capabilities: ['curation', 'synthesis'],
    keyPlaceholder: 'AI...',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
export const PROVIDER_IDS = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];

/** CLI-friendly display labels derived from PROVIDERS */
export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  PROVIDER_LIST.map(p => [p.id, p.label])
);

/**
 * Step configuration with labels and requirements
 */
export interface StepConfig {
  id: ProviderStep;
  label: string;
  description: string;
  required: boolean;
}

export const STEPS: StepConfig[] = [
  {
    id: 'search',
    label: 'Web Search',
    description: 'Find recent news and announcements',
    required: false,  // Can generate without search
  },
  {
    id: 'curation',
    label: 'Feed Curation',
    description: 'Filter feeds for relevance',
    required: true,
  },
  {
    id: 'synthesis',
    label: 'Diff Synthesis',
    description: 'Generate the final diff',
    required: true,   // Must have this
  },
];

/**
 * Get providers that support a given step
 */
export function getProvidersForStep(step: ProviderStep): ProviderConfig[] {
  return PROVIDER_LIST.filter(p => p.capabilities.includes(step));
}

/**
 * Check if all required steps have a provider with a key
 */
export function isConfigurationComplete(
  keys: Record<string, string | undefined>,
  selections: Record<ProviderStep, string | null>
): boolean {
  for (const step of STEPS) {
    if (!step.required) continue;

    const selectedProvider = selections[step.id];
    if (!selectedProvider) return false;

    const hasKey = !!keys[selectedProvider];
    if (!hasKey) return false;
  }
  return true;
}

/**
 * Get available providers for a step (those with keys)
 */
export function getAvailableProvidersForStep(
  step: ProviderStep,
  keys: Record<string, string | undefined>
): ProviderConfig[] {
  return getProvidersForStep(step).filter(p => !!keys[p.id]);
}

export type { ProviderSelections } from '../types/sync';

export const DEFAULT_SELECTIONS: ProviderSelections = {
  search: null,
  curation: null,
  synthesis: null,
};
