import Alpine from 'alpinejs';
import {
  LANGUAGES,
  FRAMEWORKS,
  TOOLS,
  TOPICS,
  DEPTHS,
  FIELD_OPTIONS
} from '../lib/constants';
import { validateApiKey } from '../lib/api';

interface SetupData {
  name: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth: string;
  customFocus: string;
}

Alpine.data('setup', () => ({
  step: 0,
  customInput: '',
  apiKey: '',
  useExistingKey: false,
  changeApiKey: false,
  saving: false,
  setupError: '',
  isEditing: false,
  hasExistingProfiles: false,
  validatingKey: false,
  apiKeyValid: null as boolean | null,
  originalApiKey: '',
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

  get existingApiKey(): string | null {
    const profiles = Object.values((this as any).$store.app.profiles);
    if (profiles.length === 0) return null;
    return (profiles[0] as any).apiKey || null;
  },

  get apiKeyUnchanged(): boolean {
    return this.isEditing && this.apiKey === this.originalApiKey;
  },

  init() {
    const params = new URLSearchParams(window.location.search);
    const editStep = params.get('edit');
    this.hasExistingProfiles = Object.keys((this as any).$store.app.profiles).length > 0;

    if (editStep && (this as any).$store.app.profile) {
      this.isEditing = true;
      this.step = parseInt(editStep);
      const p = (this as any).$store.app.profile;
      this.apiKey = p.apiKey || '';
      this.originalApiKey = p.apiKey || '';
      this.data = {
        name: p.name,
        languages: [...(p.languages || [])],
        frameworks: [...(p.frameworks || [])],
        tools: [...(p.tools || [])],
        topics: [...(p.topics || [])],
        depth: p.depth || 'standard',
        customFocus: p.customFocus || ''
      };
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

  selectUseExistingKey() {
    this.useExistingKey = true;
    this.apiKey = this.existingApiKey || '';
  },

  selectEnterNewKey() {
    this.useExistingKey = false;
    this.apiKey = '';
    this.apiKeyValid = null;
    setTimeout(() => {
      const input = document.querySelector('.text-input[placeholder="sk-ant-..."]') as HTMLInputElement;
      input?.focus();
    }, 50);
  },

  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey.trim()) return false;

    this.validatingKey = true;
    this.setupError = '';
    this.apiKeyValid = null;

    try {
      const valid = await validateApiKey(this.apiKey);
      this.apiKeyValid = valid;
      if (!valid) {
        this.setupError = 'Invalid API key';
      }
      return valid;
    } catch {
      this.apiKeyValid = false;
      this.setupError = 'Could not validate API key';
      return false;
    } finally {
      this.validatingKey = false;
    }
  },

  async nextStep() {
    if (this.step === 1 && this.apiKeyValid !== true && !this.apiKeyUnchanged) {
      const valid = await this.validateApiKey();
      if (!valid) return;
    }
    this.step++;
  },

  prevStep() {
    if (this.step > 0) this.step--;
  },

  get showKeyChoice(): boolean {
    return !this.isEditing && !!this.existingApiKey && !this.useExistingKey && this.apiKey === '';
  },

  get showKeyInput(): boolean {
    if (this.isEditing) return this.changeApiKey;
    if (!this.existingApiKey) return true;
    return !this.useExistingKey && !this.showKeyChoice;
  },

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

  async saveProfile() {
    this.setupError = '';

    if (!this.apiKey) {
      this.setupError = 'API key is required';
      return;
    }

    if (!this.data.name.trim()) {
      this.setupError = 'Name is required';
      return;
    }

    // Only validate if API key changed
    if (!this.apiKeyUnchanged && this.apiKeyValid !== true) {
      const valid = await this.validateApiKey();
      if (!valid) return;
    }

    this.saving = true;
    try {
      if (this.isEditing) {
        (this as any).$store.app.updateProfile({
          ...this.data,
          apiKey: this.apiKey,
        });
      } else {
        (this as any).$store.app.createProfile({
          ...this.data,
          apiKey: this.apiKey,
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
      // Create demo profile
      (this as any).$store.app.createProfile({
        name: 'Demo',
        apiKey: 'demo-key-placeholder',
        languages: ['TypeScript', 'Python', 'Rust'],
        frameworks: ['React', 'Node.js'],
        tools: ['Docker', 'PostgreSQL'],
        topics: ['AI/ML', 'Web Development'],
        depth: 'standard',
        customFocus: ''
      });

      // Generate 5 demo diffs over the last 10 days (every 2 days)
      const now = new Date();
      const demoDiffs = [];

      for (let i = 0; i < 5; i++) {
        const daysAgo = i * 2;
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);

        const titles = [
          'Developer Ecosystem Brief',
          'Tech Stack Updates',
          'Platform & Tools Roundup',
          'Language & Framework News',
          'Infrastructure & DevTools Digest'
        ];

        demoDiffs.push({
          id: crypto.randomUUID(),
          title: titles[i % titles.length],
          content: this.generateDemoContent(daysAgo),
          generated_at: date.toISOString(),
          duration_seconds: 15 + Math.floor(Math.random() * 20)
        });
      }

      // Add diffs to history using the setter (newest first)
      (this as any).$store.app.history = demoDiffs;

      window.location.href = '/';
    } catch (e: unknown) {
      this.setupError = e instanceof Error ? e.message : 'Failed to create demo profile';
      this.saving = false;
    }
  },

  generateDemoContent(daysAgo: number): string {
    const topics = [
      '## TypeScript 5.4 Brings New Type Inference Magic\n\nThe TypeScript team released [version 5.4](https://devblogs.microsoft.com/typescript/announcing-typescript-5-4/) with significant improvements to type inference and better error messages. The new `NoInfer` utility type helps prevent unwanted type widening.\n\n## React 19 Beta: Server Components Go Stable\n\nReact announced [version 19 beta](https://react.dev/blog/2024/04/25/react-19) with stable Server Components and new hooks like `useFormStatus` for better data fetching patterns.',
      '## Python 3.13 JIT Compiler Shows 20% Speed Boost\n\nPython core developers [announced](https://discuss.python.org/t/a-jit-compiler-for-cpython/33092) experimental JIT compilation support in 3.13, showing up to 20% performance improvements in benchmarks.\n\n## Rust 1.77 Slashes Compile Times\n\nThe latest [Rust release](https://blog.rust-lang.org/2024/03/21/Rust-1.77.0.html) brings async improvements and notably faster compilation through improved incremental builds.',
      '## Docker Desktop Optimizes Apple Silicon Performance\n\nDocker released [version 4.28](https://docs.docker.com/desktop/release-notes/) with major container performance improvements on Apple Silicon, reducing memory usage by up to 30%.\n\n## PostgreSQL 17 Beta Unveils Parallel Vacuum\n\nPostgreSQL [announced](https://www.postgresql.org/about/news/postgresql-17-beta-1-released-2853/) parallel vacuum operations and enhanced JSON indexing in the 17 beta release.',
      '## VS Code Adds AI-Powered Completions\n\nMicrosoft [introduced](https://code.visualstudio.com/updates/) GitHub Copilot-powered debugging and improved multi-cursor editing in the latest VS Code update.\n\n## GitHub Actions Adds Larger Runners\n\nGitHub [announced](https://github.blog/changelog/2024-01-30-github-actions-introducing-the-new-m1-macos-runner/) new M1 macOS runners and improved caching strategies that cut CI/CD times by up to 50%.',
      '## Claude 3.5 Sonnet Sets New Benchmarks\n\nAnthropic released [Claude 3.5 Sonnet](https://www.anthropic.com/news/claude-3-5-sonnet) with groundbreaking code generation capabilities and vision understanding.\n\n## Bun 1.0.30 Achieves npm Compatibility\n\nThe [latest Bun release](https://bun.sh/blog/bun-v1.0.30) brings near-complete npm compatibility while maintaining 10x faster package installation speeds.'
    ];

    return topics[daysAgo % topics.length];
  }
}));
