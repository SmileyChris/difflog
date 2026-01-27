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
  }
}));
