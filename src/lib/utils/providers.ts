/**
 * Provider capabilities and configuration
 */

export type ProviderStep = 'search' | 'curation' | 'synthesis';

export interface ProviderConfig {
  id: string;
  name: string;
  capabilities: ProviderStep[];
  keyPlaceholder: string;
  keyPrefix?: string;  // For validation hint (e.g., "sk-ant-")
  docsUrl?: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    capabilities: ['search', 'curation', 'synthesis'],
    keyPlaceholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com/',
  },
  serper: {
    id: 'serper',
    name: 'Serper',
    capabilities: ['search'],
    keyPlaceholder: 'API key',
    docsUrl: 'https://serper.dev/api-keys',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    capabilities: ['search', 'synthesis'],
    keyPlaceholder: 'pplx-...',
    keyPrefix: 'pplx-',
    docsUrl: 'https://www.perplexity.ai/settings/api',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    capabilities: ['curation', 'synthesis'],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    capabilities: ['curation', 'synthesis'],
    keyPlaceholder: 'AI...',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
export const PROVIDER_IDS = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];

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

/**
 * Provider selections stored in profile
 */
export interface ProviderSelections {
  search: string | null;
  curation: string | null;
  synthesis: string | null;
}

export const DEFAULT_SELECTIONS: ProviderSelections = {
  search: null,
  curation: null,
  synthesis: null,
};
