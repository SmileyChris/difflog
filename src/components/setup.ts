import Alpine from 'alpinejs';
import {
  LANGUAGES,
  FRAMEWORKS,
  TOOLS,
  TOPICS,
  DEPTHS,
  FIELD_OPTIONS
} from '../lib/constants';
import {
  validateAnthropicKey,
  validateSerperKey,
  validatePerplexityKey,
  validateDeepSeekKey,
  validateGeminiKey,
} from '../lib/api';
import { PROVIDERS, STEPS, type ProviderStep, type ProviderConfig } from '../lib/providers';
import { estimateDiffCost } from '../lib/pricing';

interface SetupData {
  name: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth: string;
  customFocus: string;
}

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

interface ProviderState {
  key: string;
  status: ValidationStatus;
  masked: boolean;
}

const VALIDATORS: Record<string, (key: string) => Promise<boolean>> = {
  anthropic: validateAnthropicKey,
  serper: validateSerperKey,
  perplexity: validatePerplexityKey,
  deepseek: validateDeepSeekKey,
  gemini: validateGeminiKey,
};

Alpine.data('setup', () => ({
  step: 0,
  customInput: '',
  saving: false,
  setupError: '',
  isEditing: false,
  hasExistingProfiles: false,
  ctrlHeld: false,
  data: {
    name: '',
    languages: [] as string[],
    frameworks: [] as string[],
    tools: [] as string[],
    topics: [] as string[],
    depth: 'standard',
    customFocus: ''
  } as SetupData,
  languages: LANGUAGES,
  frameworks: FRAMEWORKS,
  tools: TOOLS,
  topics: TOPICS,
  depths: DEPTHS,

  // Provider config state
  providers: Object.fromEntries(
    Object.keys(PROVIDERS).map(id => [id, {
      key: '',
      status: 'idle' as ValidationStatus,
      masked: true,
    }])
  ) as Record<string, ProviderState>,

  selections: {
    search: null as string | null,
    curation: null as string | null,
    synthesis: null as string | null,
  },

  editingProvider: null as string | null,
  originalEditingKey: '' as string,  // Track original key when modal opens
  providerList: Object.values(PROVIDERS),
  steps: STEPS,

  // Show other providers (beyond Anthropic)
  showOtherProviders: false,

  // Key sharing across profiles
  existingKeys: {} as Record<string, string>,

  init() {
    const params = new URLSearchParams(window.location.search);
    const editStep = params.get('edit');
    this.hasExistingProfiles = Object.keys((this as any).$store.app.profiles).length > 0;

    if (editStep && (this as any).$store.app.profile) {
      this.isEditing = true;
      this.step = parseInt(editStep);
      const p = (this as any).$store.app.profile;
      this.data = {
        name: p.name,
        languages: [...(p.languages || [])],
        frameworks: [...(p.frameworks || [])],
        tools: [...(p.tools || [])],
        topics: [...(p.topics || [])],
        depth: p.depth || 'standard',
        customFocus: p.customFocus || ''
      };

      // Load existing provider keys
      if (p.apiKey) {
        this.providers.anthropic.key = p.apiKey;
        this.providers.anthropic.status = 'valid';
      }
      if (p.apiKeys) {
        for (const [id, key] of Object.entries(p.apiKeys)) {
          if (key && this.providers[id]) {
            this.providers[id].key = key as string;
            this.providers[id].status = 'valid';
          }
        }
      }
      // Load selections
      if (p.providerSelections) {
        this.selections = { ...this.selections, ...p.providerSelections };
      }

      // Auto-select valid providers for any empty steps (handles upgrades from old profiles)
      for (const step of ['search', 'curation', 'synthesis'] as ProviderStep[]) {
        if (!this.selections[step]) {
          for (const [id, state] of Object.entries(this.providers)) {
            if (state.status === 'valid' && this.hasCapability(id, step)) {
              this.selections[step] = id;
              break;
            }
          }
        }
      }

      // Expand other providers if profile uses non-Anthropic keys
      const hasOtherKeys = p.apiKeys && Object.keys(p.apiKeys).some(k => k !== 'anthropic' && p.apiKeys[k]);
      this.showOtherProviders = hasOtherKeys;

      // Check for importable keys from other profiles (excluding current profile)
      this.existingKeys = this.getExistingKeys(p.id);
    } else {
      // New profile: check for existing keys from other profiles
      this.existingKeys = this.getExistingKeys();
      this.showOtherProviders = false;
    }

    // Track Ctrl key state
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) this.ctrlHeld = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) this.ctrlHeld = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', () => { this.ctrlHeld = false; });
  },

  // Provider config methods
  getProviderConfig(id: string): ProviderConfig {
    return PROVIDERS[id];
  },

  hasCapability(providerId: string, step: ProviderStep): boolean {
    return PROVIDERS[providerId]?.capabilities.includes(step) ?? false;
  },

  getCellState(providerId: string, step: ProviderStep): 'selected' | 'available' | 'unavailable' | 'unsupported' {
    if (!this.hasCapability(providerId, step)) {
      return 'unsupported';
    }
    if (this.selections[step] === providerId) {
      return 'selected';
    }
    if (this.providers[providerId].status === 'valid') {
      return 'available';
    }
    return 'unavailable';
  },

  toggleSelection(providerId: string, step: ProviderStep) {
    if (!this.hasCapability(providerId, step)) return;
    if (this.providers[providerId].status !== 'valid') return;

    if (this.selections[step] === providerId) {
      // Don't allow deselecting synthesis
      if (step !== 'synthesis') {
        this.selections[step] = null;
      }
    } else {
      this.selections[step] = providerId;
    }
  },

  async validateProviderKey(providerId: string) {
    const state = this.providers[providerId];
    if (!state.key.trim()) {
      state.status = 'idle';
      return;
    }

    state.status = 'validating';
    const validator = VALIDATORS[providerId];

    try {
      const valid = await validator(state.key);
      state.status = valid ? 'valid' : 'invalid';

      if (valid) {
        // Auto-select this provider for any steps it supports that don't have a selection yet
        for (const step of ['search', 'curation', 'synthesis'] as ProviderStep[]) {
          if (!this.selections[step] && this.hasCapability(providerId, step)) {
            this.selections[step] = providerId;
          }
        }
      }
    } catch {
      state.status = 'invalid';
    }
  },

  clearProviderKey(providerId: string) {
    this.providers[providerId].key = '';
    this.providers[providerId].status = 'idle';

    // Clear selections that used this provider
    for (const step of ['search', 'curation', 'synthesis'] as ProviderStep[]) {
      if (this.selections[step] === providerId) {
        this.selections[step] = null;
      }
    }
  },

  toggleMask(providerId: string) {
    this.providers[providerId].masked = !this.providers[providerId].masked;
  },

  openKeyModal(providerId: string) {
    this.editingProvider = providerId;
    this.originalEditingKey = this.providers[providerId].key;
  },

  closeKeyModal() {
    this.editingProvider = null;
    this.originalEditingKey = '';
  },

  cancelKeyModal() {
    // Restore original key on cancel
    if (this.editingProvider && this.originalEditingKey) {
      this.providers[this.editingProvider].key = this.originalEditingKey;
      this.providers[this.editingProvider].status = 'valid';
    }
    this.closeKeyModal();
  },

  // Get existing keys from other profiles (optionally excluding a specific profile)
  getExistingKeys(excludeProfileId?: string): Record<string, string> {
    const profiles = (this as any).$store.app.profiles;
    const keys: Record<string, string> = {};
    for (const p of Object.values(profiles) as any[]) {
      if (excludeProfileId && p.id === excludeProfileId) continue;
      if (p.apiKey && !keys.anthropic) keys.anthropic = p.apiKey;
      if (p.apiKeys) {
        for (const [id, key] of Object.entries(p.apiKeys)) {
          if (key && !keys[id]) keys[id] = key as string;
        }
      }
    }
    return keys;
  },

  // Get keys from other profiles that aren't already set up
  get missingKeys(): string[] {
    return Object.keys(this.existingKeys)
      .filter(id => !this.providers[id]?.key || this.providers[id]?.status !== 'valid');
  },

  // Get display names for missing keys
  get existingKeyNames(): string {
    return this.missingKeys.map(id => {
      const provider = PROVIDERS[id];
      return provider ? provider.name : id;
    }).join(', ');
  },

  // Check if there are existing keys not yet entered
  get hasExistingKeys(): boolean {
    for (const [id, key] of Object.entries(this.existingKeys)) {
      const state = this.providers[id];
      // Show prompt if any existing key isn't entered or validated (but not while validating)
      if (key && (!state.key || (state.status !== 'valid' && state.status !== 'validating'))) {
        return true;
      }
    }
    return false;
  },

  // Import existing keys from other profiles (already validated, no need to re-verify)
  importExistingKeys() {
    const hasNonAnthropic = Object.keys(this.existingKeys).some(id => id !== 'anthropic');

    for (const [id, key] of Object.entries(this.existingKeys)) {
      // Only import if not already set up
      if (!this.providers[id].key || this.providers[id].status !== 'valid') {
        this.providers[id].key = key;
        this.providers[id].status = 'valid';  // Trust keys from other profiles
      }
    }

    // Auto-select providers for steps
    for (const step of ['search', 'curation', 'synthesis'] as ProviderStep[]) {
      if (!this.selections[step]) {
        for (const [id, state] of Object.entries(this.providers)) {
          if (state.status === 'valid' && this.hasCapability(id, step)) {
            this.selections[step] = id;
            break;
          }
        }
      }
    }

    // Expand other providers if we imported non-Anthropic keys
    if (hasNonAnthropic) this.showOtherProviders = true;
  },

  get isProviderConfigComplete(): boolean {
    return this.selections.synthesis !== null &&
           this.providers[this.selections.synthesis]?.status === 'valid';
  },

  get costEstimate() {
    return estimateDiffCost({
      search: this.selections.search as any,
      curation: this.selections.curation as any,
      synthesis: this.selections.synthesis as any,
    });
  },

  formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    }
    return `$${cost.toFixed(2)}`;
  },

  get validKeyCount(): number {
    return Object.values(this.providers).filter(p => p.status === 'valid').length;
  },

  // Navigation
  async nextStep() {
    if (this.step === 1 && !this.isProviderConfigComplete) {
      this.setupError = 'Select a provider for synthesis to continue';
      return;
    }
    this.setupError = '';
    this.step++;
  },

  prevStep() {
    if (this.step > 0) this.step--;
  },

  // Profile data methods
  toggle(field: string, item: string) {
    const arr = (this.data as any)[field] as string[];
    const idx = arr.indexOf(item);
    idx >= 0 ? arr.splice(idx, 1) : arr.push(item);
  },

  addCustom(field: string) {
    const value = this.customInput.trim();
    if (!value) return;
    const arr = (this.data as any)[field] as string[];
    if (!arr.some(i => i.toLowerCase() === value.toLowerCase())) {
      (this.data as any)[field] = [...arr, value];
    }
    this.customInput = '';
  },

  getCustomItems(field: string): string[] {
    const predefined = FIELD_OPTIONS[field] || [];
    return ((this.data as any)[field] as string[]).filter(i => !predefined.includes(i));
  },

  removeCustom(field: string, item: string) {
    const arr = (this.data as any)[field] as string[];
    const idx = arr.indexOf(item);
    if (idx >= 0) arr.splice(idx, 1);
  },

  cancelWizard() {
    window.location.href = this.hasExistingProfiles ? '/profiles' : '/welcome';
  },

  buildApiKeys(): { apiKey?: string; apiKeys?: Record<string, string> } {
    const result: { apiKey?: string; apiKeys?: Record<string, string> } = {};
    const otherKeys: Record<string, string> = {};

    for (const [id, state] of Object.entries(this.providers)) {
      if (state.status === 'valid' && state.key) {
        if (id === 'anthropic') {
          result.apiKey = state.key;
        } else {
          otherKeys[id] = state.key;
        }
      }
    }

    if (Object.keys(otherKeys).length > 0) {
      result.apiKeys = otherKeys;
    }

    return result;
  },

  async saveProfile() {
    this.setupError = '';

    if (!this.data.name.trim()) {
      this.setupError = 'Name is required';
      return;
    }

    if (!this.isProviderConfigComplete) {
      this.setupError = 'Configure at least one provider for synthesis';
      return;
    }

    this.saving = true;
    try {
      const keys = this.buildApiKeys();

      if (this.isEditing) {
        (this as any).$store.app.updateProfile({
          ...this.data,
          ...keys,
          providerSelections: this.selections,
        });
      } else {
        (this as any).$store.app.createProfile({
          ...this.data,
          ...keys,
          providerSelections: this.selections,
        });
      }
      window.location.href = '/';
    } catch (e: unknown) {
      this.setupError = e instanceof Error ? e.message : 'Failed to save profile';
      this.saving = false;
    }
  },

  createDemoProfile() {
    this.saving = true;
    try {
      (this as any).$store.app.createProfile({
        name: 'Demo',
        apiKey: 'demo-key-placeholder',
        languages: ['TypeScript', 'Python', 'Rust'],
        frameworks: ['React', 'Node.js'],
        tools: ['Docker', 'PostgreSQL'],
        topics: ['AI/ML & LLMs', 'DevOps & Platform'],
        depth: 'standard',
        customFocus: ''
      });

      const now = new Date();
      const demoDiffs = [];
      const titles = [
        'Developer Ecosystem Brief',
        'Tech Stack Updates',
        'Platform & Tools Roundup',
        'Language & Framework News',
        'Infrastructure & DevTools Digest',
        'Morning Tech Roundup'
      ];

      for (let i = 0; i < 5; i++) {
        const daysAgo = i * 2;
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);

        demoDiffs.push({
          id: crypto.randomUUID(),
          title: titles[i % titles.length],
          content: this.generateDemoContent(daysAgo),
          generated_at: date.toISOString(),
          duration_seconds: 15 + Math.floor(Math.random() * 20)
        });

        if (daysAgo === 2) {
          const earlierDate = new Date(date);
          earlierDate.setHours(earlierDate.getHours() - 8);
          demoDiffs.push({
            id: crypto.randomUUID(),
            title: titles[5],
            content: this.generateDemoContent(daysAgo),
            generated_at: earlierDate.toISOString(),
            duration_seconds: 15 + Math.floor(Math.random() * 20)
          });
        }
      }

      (this as any).$store.app.history = demoDiffs;
      window.location.href = '/';
    } catch (e: unknown) {
      this.setupError = e instanceof Error ? e.message : 'Failed to create demo profile';
      this.saving = false;
    }
  },

  generateDemoContent(daysAgo: number): string {
    const topics = [
      '## TypeScript 5.4 Brings New Type Inference Magic\n\nThe TypeScript team released [version 5.4](https://devblogs.microsoft.com/typescript/announcing-typescript-5-4/) with significant improvements to type inference and better error messages.\n\n## React 19 Beta: Server Components Go Stable\n\nReact announced [version 19 beta](https://react.dev/blog/2024/04/25/react-19) with stable Server Components and new hooks.',
      '## Python 3.13 JIT Compiler Shows 20% Speed Boost\n\nPython core developers [announced](https://discuss.python.org/t/a-jit-compiler-for-cpython/33092) experimental JIT compilation support in 3.13.\n\n## Rust 1.77 Slashes Compile Times\n\nThe latest [Rust release](https://blog.rust-lang.org/2024/03/21/Rust-1.77.0.html) brings async improvements and notably faster compilation.',
      '## Docker Desktop Optimizes Apple Silicon Performance\n\nDocker released [version 4.28](https://docs.docker.com/desktop/release-notes/) with major container performance improvements on Apple Silicon.\n\n## PostgreSQL 17 Beta Unveils Parallel Vacuum\n\nPostgreSQL [announced](https://www.postgresql.org/about/news/postgresql-17-beta-1-released-2853/) parallel vacuum operations.',
      '## VS Code Adds AI-Powered Completions\n\nMicrosoft [introduced](https://code.visualstudio.com/updates/) GitHub Copilot-powered debugging in the latest VS Code update.\n\n## GitHub Actions Adds Larger Runners\n\nGitHub [announced](https://github.blog/changelog/2024-01-30-github-actions-introducing-the-new-m1-macos-runner/) new M1 macOS runners.',
      '## Claude 3.5 Sonnet Sets New Benchmarks\n\nAnthropic released [Claude 3.5 Sonnet](https://www.anthropic.com/news/claude-3-5-sonnet) with groundbreaking code generation capabilities.\n\n## Bun 1.0.30 Achieves npm Compatibility\n\nThe [latest Bun release](https://bun.sh/blog/bun-v1.0.30) brings near-complete npm compatibility.'
    ];
    return topics[daysAgo % topics.length];
  }
}));
