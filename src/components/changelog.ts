import Alpine from 'alpinejs';
import { STORAGE_KEYS } from '../lib/constants';

interface Change {
  type: string;
  text: string;
  in: string;
}

interface Version {
  version: string;
  date: string;
  summary: string;
  description?: string;
  changes: Change[];
}

interface ChangelogData {
  versions: Version[];
}

const TYPE_ICONS: Record<string, string> = {
  feature: '✨',
  fix: '🐛'
};

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

Alpine.data('changelog', () => ({
  open: false,
  loading: false,
  error: '',
  data: null as ChangelogData | null,
  lastSeen: '',

  get currentVersion(): string {
    return (this.$el as HTMLElement).dataset.version || '';
  },

  get hasUnseen(): boolean {
    if (!this.lastSeen || !this.currentVersion) return false;
    return compareVersions(this.currentVersion, this.lastSeen) > 0;
  },

  init() {
    this.lastSeen = localStorage.getItem(STORAGE_KEYS.CHANGELOG_SEEN) || '';

    // First visit - set current version as seen (no dot on first load)
    if (!this.lastSeen && this.currentVersion) {
      this.lastSeen = this.currentVersion;
      localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, this.currentVersion);
    }
  },

  async show() {
    this.open = true;

    if (!this.data) {
      this.loading = true;
      this.error = '';

      try {
        const res = await fetch('/changelog.json');
        if (!res.ok) throw new Error('Failed to load changelog');
        this.data = await res.json();
      } catch (e) {
        this.error = 'Could not load changelog';
      } finally {
        this.loading = false;
      }
    }

    // Mark as seen
    if (this.currentVersion) {
      this.lastSeen = this.currentVersion;
      localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, this.currentVersion);
    }
  },

  hide() {
    this.open = false;
  },

  isNewChange(change: Change): boolean {
    if (!this.lastSeen) return false;
    return compareVersions(change.in, this.lastSeen) > 0;
  },

  getChangeIcon(type: string): string {
    return TYPE_ICONS[type] || '';
  },

  getChangeFallback(type: string): string {
    return TYPE_ICONS[type] ? '' : type;
  },

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}));
