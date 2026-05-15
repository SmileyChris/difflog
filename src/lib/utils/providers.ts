/**
 * Provider capabilities and configuration
 */

import type { ProviderSelections, ModelSelections } from '../types/sync';

export type ProviderStep = 'search' | 'curation' | 'synthesis';

export interface ProviderModelOption {
  id: string;       // API model ID (e.g. 'claude-opus-4-7')
  label: string;    // Display name (e.g. 'Opus 4.7')
  isDefault: boolean;
  /** Hide from new selections; still usable if profile already picked it. */
  deprecated?: boolean;
  /** Was the implicit default before model picker existed. Used for back-compat seeding. */
  previousDefault?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  label: string;  // CLI-friendly display name (e.g. "Anthropic (Claude)")
  capabilities: ProviderStep[];
  /** Available models per step. Providers with no model choice (Serper) omit this. */
  models?: Partial<Record<ProviderStep, ProviderModelOption[]>>;
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
    models: {
      search: [
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', isDefault: true },
        { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', isDefault: false, deprecated: true, previousDefault: true },
      ],
      curation: [
        { id: 'claude-haiku-4-5', label: 'Haiku 4.5', isDefault: true, previousDefault: true },
      ],
      synthesis: [
        { id: 'claude-haiku-4-5', label: 'Haiku 4.5', isDefault: false },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', isDefault: true },
        { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', isDefault: false, deprecated: true, previousDefault: true },
        { id: 'claude-opus-4-7', label: 'Opus 4.7', isDefault: false },
      ],
    },
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
    models: {
      search: [{ id: 'sonar', label: 'Sonar', isDefault: true }],
      synthesis: [
        { id: 'sonar-pro', label: 'Sonar Pro', isDefault: true },
        { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', isDefault: false },
      ],
    },
    keyPlaceholder: 'pplx-...',
    keyPrefix: 'pplx-',
    docsUrl: 'https://www.perplexity.ai/settings/api',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    label: 'DeepSeek',
    capabilities: ['curation', 'synthesis'],
    models: {
      curation: [
        { id: 'deepseek-v4-flash', label: 'V4 Flash', isDefault: true },
        { id: 'deepseek-chat', label: 'Chat (V3)', isDefault: false, deprecated: true, previousDefault: true },
      ],
      synthesis: [
        { id: 'deepseek-v4-flash', label: 'V4 Flash', isDefault: true },
        { id: 'deepseek-v4-pro', label: 'V4 Pro', isDefault: false },
        { id: 'deepseek-chat', label: 'Chat (V3)', isDefault: false, deprecated: true, previousDefault: true },
      ],
    },
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    label: 'Google Gemini',
    capabilities: ['curation', 'synthesis'],
    models: {
      curation: [
        { id: 'gemini-3.1-flash-lite', label: '3.1 Flash Lite', isDefault: true },
        { id: 'gemini-3-flash', label: '3 Flash', isDefault: false },
        { id: 'gemini-2.5-flash', label: '2.5 Flash', isDefault: false, deprecated: true, previousDefault: true },
      ],
      synthesis: [
        { id: 'gemini-3.1-flash-lite', label: '3.1 Flash Lite', isDefault: true },
        { id: 'gemini-3-flash', label: '3 Flash', isDefault: false },
        { id: 'gemini-3.1-pro', label: '3.1 Pro', isDefault: false },
        { id: 'gemini-2.5-flash', label: '2.5 Flash', isDefault: false, deprecated: true, previousDefault: true },
      ],
    },
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

export type { ProviderSelections, ModelSelections } from '../types/sync';

export const DEFAULT_SELECTIONS: ProviderSelections = {
  search: null,
  curation: null,
  synthesis: null,
};

export const DEFAULT_MODEL_SELECTIONS: ModelSelections = {
  search: null,
  curation: null,
  synthesis: null,
};

/**
 * Get the default model ID for a provider+step combination.
 */
export function getDefaultModel(providerId: string, step: ProviderStep): string | null {
  const models = PROVIDERS[providerId]?.models?.[step];
  return models?.find(m => m.isDefault)?.id ?? models?.[0]?.id ?? null;
}

/**
 * Get models available for a provider+step combination.
 */
export function getModelsForStep(providerId: string, step: ProviderStep): ProviderModelOption[] {
  return PROVIDERS[providerId]?.models?.[step] ?? [];
}

/**
 * Resolve the effective model for a step: explicit override (if still registered)
 * > default from provider > null. Orphaned model ids (removed from PROVIDERS)
 * silently fall back to the current default so the API call doesn't 404 with a
 * stale name.
 */
export function resolveModel(
  providerId: string | null | undefined,
  step: ProviderStep,
  modelSelections?: ModelSelections | null,
): string | null {
  if (!providerId) return null;
  const stored = modelSelections?.[step];
  if (stored) {
    const known = PROVIDERS[providerId]?.models?.[step]?.some(m => m.id === stored);
    if (known) return stored;
  }
  return getDefaultModel(providerId, step);
}

/**
 * Model that was the implicit default before per-step model picker existed.
 * Used to seed `modelSelections` for profiles created prior to the picker.
 */
export function getPreviousDefaultModel(providerId: string, step: ProviderStep): string | null {
  const models = PROVIDERS[providerId]?.models?.[step];
  return models?.find(m => m.previousDefault)?.id ?? null;
}

/**
 * True if the model is registered as deprecated for the given step.
 */
export function isModelDeprecated(providerId: string, step: ProviderStep, modelId: string): boolean {
  return PROVIDERS[providerId]?.models?.[step]?.find(m => m.id === modelId)?.deprecated === true;
}
