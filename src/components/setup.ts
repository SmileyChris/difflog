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
  apiSource: 'byok' | 'creds';
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
  // Account/creds state
  accountEmail: '',
  accountCode: '',
  accountCreds: 5,
  accountStep: 'email' as 'email' | 'code' | 'done',
  accountSending: false,
  accountVerifying: false,
  accountError: '',
  data: {
    name: '',
    apiSource: 'creds' as 'byok' | 'creds',
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

    // Check if user already has an account (for creds mode)
    const user = (this as any).$store.app.user;
    if (user?.emailVerified) {
      this.accountEmail = user.email;
      this.accountStep = 'done';
    }

    if (editStep && (this as any).$store.app.profile) {
      this.isEditing = true;
      this.step = parseInt(editStep);
      const p = (this as any).$store.app.profile;
      this.apiKey = p.apiKey || '';
      this.originalApiKey = p.apiKey || '';
      this.data = {
        name: p.name,
        apiSource: p.apiSource || 'byok',
        languages: [...(p.languages || [])],
        frameworks: [...(p.frameworks || [])],
        tools: [...(p.tools || [])],
        topics: [...(p.topics || [])],
        depth: p.depth || 'standard',
        customFocus: p.customFocus || ''
      };
    }
  },

  selectApiSource(source: 'byok' | 'creds') {
    this.data.apiSource = source;
  },

  async requestAccountCode() {
    if (!this.accountEmail.trim()) {
      this.accountError = 'Email is required';
      return;
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.accountEmail)) {
      this.accountError = 'Please enter a valid email';
      return;
    }

    this.accountSending = true;
    this.accountError = '';

    try {
      const res = await fetch('/api/creds/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.accountEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send verification code');
      }

      this.accountStep = 'code';
    } catch (e: unknown) {
      this.accountError = e instanceof Error ? e.message : 'Failed to send verification code';
    } finally {
      this.accountSending = false;
    }
  },

  async verifyAccountCode() {
    if (!this.accountCode.trim()) {
      this.accountError = 'Verification code is required';
      return;
    }

    this.accountVerifying = true;
    this.accountError = '';

    try {
      const res = await fetch('/api/creds/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.accountEmail, code: this.accountCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      // Store creds temporarily - will login on save
      this.accountCreds = data.creds || 5;
      this.accountStep = 'done';
    } catch (e: unknown) {
      this.accountError = e instanceof Error ? e.message : 'Invalid verification code';
    } finally {
      this.accountVerifying = false;
    }
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

  nextStep() {
    this.setupError = '';
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

    // Validate based on API source
    if (this.data.apiSource === 'byok') {
      if (!this.apiKey) {
        this.setupError = 'API key is required';
        return;
      }
      // Only validate if API key changed
      if (!this.apiKeyUnchanged && this.apiKeyValid !== true) {
        const valid = await this.validateApiKey();
        if (!valid) return;
      }
    } else {
      // Credits mode: user must be logged in or have verified in this session
      if (!(this as any).$store.app.isLoggedIn && this.accountStep !== 'done') {
        this.setupError = 'Please complete email verification first';
        return;
      }
      // Login now if verified in this session but not yet saved
      if (!(this as any).$store.app.isLoggedIn && this.accountStep === 'done') {
        (this as any).$store.app.loginUser(this.accountEmail, this.accountCode, this.accountCreds);
      }
    }

    if (!this.data.name.trim()) {
      this.setupError = 'Name is required';
      return;
    }

    this.saving = true;
    try {
      const credsFields = this.data.apiSource === 'creds' ? { hasUsedCreds: true } : {};
      if (this.isEditing) {
        (this as any).$store.app.updateProfile({
          ...this.data,
          ...(this.data.apiSource === 'byok' ? { apiKey: this.apiKey } : {}),
          ...credsFields,
        });
      } else {
        (this as any).$store.app.createProfile({
          ...this.data,
          ...(this.data.apiSource === 'byok' ? { apiKey: this.apiKey } : {}),
          ...credsFields,
        });
      }
      window.location.href = '/';
    } catch (e: unknown) {
      this.setupError = e instanceof Error ? e.message : 'Failed to save profile';
      this.saving = false;
    }
  }
}));
