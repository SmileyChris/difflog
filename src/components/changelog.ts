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
  showAll: false,
  currentVersion: '',
  dotDismissed: false,

  get hasUnseen(): boolean {
    if (!this.lastSeen || !this.currentVersion) return false;
    return compareVersions(this.currentVersion, this.lastSeen) > 0;
  },

  get showDot(): boolean {
    return this.hasUnseen && !this.dotDismissed;
  },

  get visibleVersions(): Version[] {
    if (!this.data) return [];
    if (this.showAll) return this.data.versions;

    // Show all versions that have unseen changes
    const visible = this.data.versions.filter(v =>
      v.changes.some(c => c.in && compareVersions(c.in, this.lastSeen) > 0)
    );

    // Always show at least the latest version
    return visible.length > 0 ? visible : this.data.versions.slice(0, 1);
  },

  get hiddenCount(): number {
    if (!this.data) return 0;
    return Math.max(0, this.data.versions.length - this.visibleVersions.length);
  },

  init() {
    this.currentVersion = (this.$el as HTMLElement).dataset.version || '';
    this.lastSeen = localStorage.getItem(STORAGE_KEYS.CHANGELOG_SEEN) || '';

    // First visit - set current version as seen (no dot on first load)
    if (!this.lastSeen && this.currentVersion) {
      this.lastSeen = this.currentVersion;
      localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, this.currentVersion);
    }
  },

  async show() {
    this.open = true;
    this.dotDismissed = true;

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
  },

  hide() {
    this.open = false;
    this.showAll = false;

    // Save to storage for next session, but keep lastSeen unchanged for this session
    if (this.currentVersion) {
      localStorage.setItem(STORAGE_KEYS.CHANGELOG_SEEN, this.currentVersion);
    }
  },

  isNewChange(change: Change): boolean {
    if (!this.lastSeen || !change.in) return false;
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
