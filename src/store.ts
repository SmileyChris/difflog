import Alpine from 'alpinejs';
import { renderMarkdown } from './lib/markdown';
import { timeAgo } from './lib/time';
import { calculateStreak, getStreakCalendar, type StreakResult, type CalendarMonth } from './lib/streak';
import { ApiError } from './lib/api';
import {
  getSyncPassword,
  setSyncPassword,
  getRememberedPassword,
  setRememberedPassword,
  clearRememberedPassword,
  hasRememberedPassword,
  createEmptyPending,
  trackChange,
  hasPendingChanges as checkPending,
  checkStatus,
  shareProfile as shareProfileApi,
  importProfile as importProfileApi,
  uploadContent,
  downloadContent,
  updatePassword as updatePasswordApi,
  starId,
  getAnthropicKey,
  type PendingChanges,
  type SyncStatus,
  type Profile,
  type Diff,
  type Star
} from './lib/sync';

// Alpine Store - Local-first architecture
// All data stored locally, server only used for optional sharing/sync
Alpine.store('app', {
  // All profile data persisted locally
  profiles: Alpine.$persist({} as Record<string, Profile>).as('difflog-profiles'),
  activeProfileId: Alpine.$persist(null as string | null).as('difflog-active-profile'),
  histories: Alpine.$persist({} as Record<string, Diff[]>).as('difflog-histories'),
  bookmarks: Alpine.$persist({} as Record<string, Star[]>).as('difflog-bookmarks'),

  // Sync status (not persisted - session only)
  syncStatus: null as SyncStatus | null,
  syncing: false,
  syncError: null as string | null,

  // Sync dropdown state
  syncDropdownOpen: false,
  syncDropdownPassword: '',
  syncDropdownRemember: false,
  syncResult: null as { uploaded: number; downloaded: number } | null,
  _syncResultTimeout: null as ReturnType<typeof setTimeout> | null,

  // Reactivity trigger for password state (increment to notify Alpine of changes)
  _passwordVersion: 0,

  // Cached password for session (falls back to remembered password)
  get _syncPassword(): string | null {
    // Touch version to make this getter reactive
    void this._passwordVersion;
    const sessionPwd = getSyncPassword();
    if (sessionPwd) return sessionPwd;
    // Fall back to remembered password for active profile
    if (this.activeProfileId) {
      const remembered = getRememberedPassword(this.activeProfileId);
      if (remembered) {
        // Promote to session storage for this tab
        setSyncPassword(remembered);
        return remembered;
      }
    }
    return null;
  },
  set _syncPassword(val: string | null) {
    setSyncPassword(val);
    this._passwordVersion++;
  },

  // Check if current profile has a remembered password
  get hasRememberedPassword(): boolean {
    // Touch version to make this getter reactive
    void this._passwordVersion;
    return this.activeProfileId ? hasRememberedPassword(this.activeProfileId) : false;
  },

  // Check if a specific profile has a remembered password
  hasRememberedPasswordFor(profileId: string): boolean {
    void this._passwordVersion;
    return hasRememberedPassword(profileId);
  },

  // Remember password for current profile (persists across sessions)
  rememberPassword(password: string) {
    if (this.activeProfileId) {
      setRememberedPassword(this.activeProfileId, password);
      this._passwordVersion++;
    }
  },

  // Forget password for current profile (clears both session and remembered)
  forgetPassword() {
    setSyncPassword(null);
    if (this.activeProfileId) {
      clearRememberedPassword(this.activeProfileId);
    }
    this._passwordVersion++;
  },

  // Track pending changes for sync
  pendingSync: Alpine.$persist({} as Record<string, PendingChanges>).as('difflog-pending-sync'),

  // Convenience getters
  get profile(): Profile | null {
    return this.activeProfileId ? this.profiles[this.activeProfileId] : null;
  },
  get apiKey(): string | null {
    return this.profile ? getAnthropicKey(this.profile) || null : null;
  },
  get isUnlocked(): boolean {
    return this.profile !== null && this.apiKey !== null;
  },
  get history(): Diff[] {
    return this.activeProfileId ? this.histories[this.activeProfileId] || [] : [];
  },
  set history(val: Diff[]) {
    if (this.activeProfileId) {
      this.histories = { ...this.histories, [this.activeProfileId]: val };
    }
  },
  get stars(): Star[] {
    return this.activeProfileId ? this.bookmarks[this.activeProfileId] || [] : [];
  },
  set stars(val: Star[]) {
    if (this.activeProfileId) {
      this.bookmarks = { ...this.bookmarks, [this.activeProfileId]: val };
    }
  },

  // Helper for star count label
  get starCountLabel(): string {
    const count = this.stars?.length || 0;
    return `${count} ${count === 1 ? 'Star' : 'Stars'}`;
  },

  // Streak calculation
  get streak(): StreakResult {
    const dates = this.history.map((d: Diff) => new Date(d.generated_at));
    return calculateStreak(dates);
  },

  get streakCalendar(): CalendarMonth[] {
    const streak = this.streak;
    // Build a map of date -> diff count
    const diffCounts = new Map<string, number>();
    for (const diff of this.history) {
      const d = new Date(diff.generated_at);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      diffCounts.set(iso, (diffCounts.get(iso) || 0) + 1);
    }
    return getStreakCalendar(streak.startDate, diffCounts);
  },

  // Sync state for UI
  get syncState(): 'local' | 'syncing' | 'pending' | 'synced' {
    if (!this.profile?.syncedAt) return 'local';
    if (this.syncing) return 'syncing';
    if (!this._syncPassword) return 'pending';
    return 'synced';
  },

  get lastSyncedAgo(): string {
    if (!this.profile?.syncedAt) return '';
    return timeAgo(this.profile.syncedAt);
  },

  // Sync dropdown methods
  toggleSyncDropdown() {
    if (this.syncDropdownOpen) {
      this.closeSyncDropdown();
    } else {
      this.openSyncDropdown();
    }
  },

  openSyncDropdown() {
    this.syncDropdownOpen = true;
    // Keep error visible so user can see what went wrong
    // Error is cleared when user starts a new sync attempt
    this.syncResult = null;
    this.syncDropdownPassword = '';
    this.syncDropdownRemember = false;
  },

  closeSyncDropdown() {
    this.syncDropdownOpen = false;
    this.syncError = null;
    this.syncDropdownPassword = '';
    if (this._syncResultTimeout) {
      clearTimeout(this._syncResultTimeout);
      this._syncResultTimeout = null;
    }
  },

  async doSyncFromDropdown() {
    // Clear previous error when starting new attempt
    this.syncError = null;

    // If already logged in, just sync
    if (this._syncPassword) {
      await this._performSync(this._syncPassword);
      return;
    }

    // Need password
    if (!this.syncDropdownPassword) {
      this.syncError = 'Password required';
      return;
    }

    const password = this.syncDropdownPassword;
    const shouldRemember = this.syncDropdownRemember;
    await this._performSync(password);

    // If sync succeeded and remember was checked, save password
    if (!this.syncError && shouldRemember) {
      this.rememberPassword(password);
    }
  },

  async _performSync(password: string) {
    try {
      const result = await this.syncContent(password);
      this.syncResult = result;
      this.syncDropdownPassword = '';

      // Auto-dismiss after 2 seconds
      this._syncResultTimeout = setTimeout(() => {
        this.syncResult = null;
        this.syncDropdownOpen = false;
      }, 2000);
    } catch (e: unknown) {
      // On auth error, clear any remembered password (it's wrong)
      if (e instanceof ApiError && e.status === 401) {
        if (this.activeProfileId) {
          clearRememberedPassword(this.activeProfileId);
          this._passwordVersion++;
        }
        this.syncError = 'Invalid password';
      } else if (e instanceof ApiError && e.status === 429) {
        this.syncError = e.message; // "Too many attempts..." from ApiError
      } else {
        this.syncError = e instanceof Error ? e.message : 'Sync failed';
      }
    }
  },

  // Helper for time formatting in templates
  formatTimeAgo(dateStr: string): string {
    return timeAgo(dateStr);
  },

  init() {
    this.migrateOldData();
    this.migrateToReferenceStars();
    this.checkSyncStatus();

    // Sync when returning to tab if last sync was over 1 hour ago
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this._syncIfStale();
      }
    });
  },

  _syncIfStale() {
    if (!this._syncPassword || !this.profile?.syncedAt) return;
    const lastSync = new Date(this.profile.syncedAt).getTime();
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - lastSync > oneHour) {
      this.autoSync();
    }
  },

  // Migration: Convert to reference-based stars
  migrateToReferenceStars() {
    if (this.activeProfileId && this.stars.length > 0) {
      const hasLegacyStars = this.stars.some((s: Star) => (s as any).content !== undefined);
      if (hasLegacyStars) {
        this.stars = [];
        console.log('[Migration] Cleared legacy content-based stars');
      }
    }

    if (this.activeProfileId && this.history.length > 0) {
      const hasStoredHtml = this.history.some((d: Diff) => (d as any).html !== undefined);
      if (hasStoredHtml) {
        this.history = this.history.map((d: Diff) => {
          const { html, ...rest } = d as any;
          return rest;
        });
        console.log('[Migration] Removed stored HTML from diffs');
      }
    }

    // Migration: Remove id field from stars (now computed from diff_id:p_index)
    if (this.activeProfileId && this.stars.length > 0) {
      const hasIdField = this.stars.some((s: Star) => (s as any).id !== undefined);
      if (hasIdField) {
        // Deduplicate by (diff_id, p_index) and remove id field
        const seen = new Set<string>();
        this.stars = this.stars.filter((s: Star) => {
          const key = starId(s);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).map((s: Star) => {
          const { id, ...rest } = s as any;
          return rest as Star;
        });
        console.log('[Migration] Removed id field from stars');
      }
    }
  },

  async checkSyncStatus() {
    this.syncStatus = null;
    if (!this.profile?.syncedAt || !this.activeProfileId) return;

    const status = await checkStatus(
      this.activeProfileId,
      this.profile,
      this.history,
      this.stars,
      this._syncPassword
    );

    const hasPending = this.hasPendingChanges();
    this.syncStatus = {
      ...status,
      needsSync: status.needsSync || hasPending
    };

    // Clear syncedAt if profile no longer exists on server
    if (!status.exists) {
      const profile = this.profiles[this.activeProfileId];
      if (profile?.syncedAt) {
        this.profiles = {
          ...this.profiles,
          [this.activeProfileId]: { ...profile, syncedAt: null }
        };
      }
    }

    // Auto-sync if hashes don't match and password is cached
    if ((status.needsSync || hasPending) && this._syncPassword) {
      try {
        await this.syncContent(this._syncPassword);
      } catch (e: unknown) {
        // On auth error, clear cached password
        if (e instanceof ApiError && e.status === 401) {
          setSyncPassword(null);
          if (this.activeProfileId) {
            clearRememberedPassword(this.activeProfileId);
          }
          this._passwordVersion++;
          this.syncError = 'Invalid password';
        } else if (e instanceof ApiError && e.status === 429) {
          this.syncError = e.message;
        } else {
          console.error('Auto-sync on status check failed:', e);
        }
      }
    }
  },

  migrateOldData() {
    const oldProfiles = localStorage.getItem('difflog-local-profiles');
    if (oldProfiles) {
      localStorage.removeItem('difflog-local-profiles');
      localStorage.removeItem('difflog-content-hashes');
      sessionStorage.removeItem('difflog-session');
    }
  },

  // Create a new local profile
  createProfile(data: { name: string; apiKey: string; languages: string[]; frameworks: string[]; tools: string[]; topics: string[]; depth: string; customFocus: string }): string {
    const id = crypto.randomUUID();
    const profile: Profile = {
      id,
      name: data.name,
      apiKey: data.apiKey,
      languages: data.languages,
      frameworks: data.frameworks,
      tools: data.tools,
      topics: data.topics,
      depth: data.depth,
      customFocus: data.customFocus,
      createdAt: new Date().toISOString(),
    };

    this.profiles = { ...this.profiles, [id]: profile };
    this.histories = { ...this.histories, [id]: [] };
    this.bookmarks = { ...this.bookmarks, [id]: [] };
    this.activeProfileId = id;

    return id;
  },

  // Switch to a different profile
  switchProfile(id: string) {
    if (this.profiles[id]) {
      this._syncPassword = null;
      this.activeProfileId = id;
      this.checkSyncStatus();
    }
  },

  // Update current profile
  updateProfile(updates: Partial<Profile>) {
    if (!this.activeProfileId) return;
    const current = this.profiles[this.activeProfileId];
    this.profiles = {
      ...this.profiles,
      [this.activeProfileId]: { ...current, ...updates }
    };

    const syncableFields = ['name', 'languages', 'frameworks', 'tools', 'topics', 'depth', 'customFocus'];
    const hasSyncableChange = syncableFields.some(field => field in updates);
    if (hasSyncableChange) {
      this._trackProfileModified();
    }
  },

  // Delete a profile
  deleteProfile(id: string) {
    const { [id]: _, ...rest } = this.profiles;
    this.profiles = rest;
    const { [id]: __, ...restHistories } = this.histories;
    this.histories = restHistories;
    const { [id]: ___, ...restBookmarks } = this.bookmarks;
    this.bookmarks = restBookmarks;

    // Clean up remembered password
    clearRememberedPassword(id);

    if (this.activeProfileId === id) {
      const remaining = Object.keys(this.profiles);
      this.activeProfileId = remaining.length > 0 ? remaining[0] : null;
    }
  },

  addDiff(entry: Diff) {
    this.history = [entry, ...this.history].slice(0, 50);
    this._trackModifiedDiff(entry.id);
  },

  deleteDiff(id: string) {
    const starsToRemove = this.stars.filter((s: Star) => s.diff_id === id);
    for (const star of starsToRemove) {
      this._trackDeletedStar(starId(star));
    }
    this.stars = this.stars.filter((s: Star) => s.diff_id !== id);
    this.history = this.history.filter((d: Diff) => d.id !== id);
    this._trackDeletedDiff(id);
  },

  addStar(entry: Star) {
    this.stars = [entry, ...this.stars];
    this._trackModifiedStar(starId(entry));
  },

  removeStar(diffId: string, pIndex: number) {
    this.stars = this.stars.filter((s: Star) => !(s.diff_id === diffId && s.p_index === pIndex));
    this._trackDeletedStar(starId(diffId, pIndex));
  },

  isStarred(diffId: string, pIndex: number): boolean {
    return this.stars.some((s: Star) => s.diff_id === diffId && s.p_index === pIndex);
  },

  renderDiff(diff: Diff): string {
    if (!diff?.content) return '';
    return renderMarkdown(diff.content);
  },

  getStarContent(star: Star): { html: string; content: string; diff_title: string; diff_date: string } | null {
    const diff = this.history.find((d: Diff) => d.id === star.diff_id);
    if (!diff) return null;

    const html = renderMarkdown(diff.content);
    const container = document.createElement('div');
    container.innerHTML = html;
    const element = container.querySelector(`[data-p="${star.p_index}"]`);
    if (!element) return null;

    return {
      html: element.outerHTML,
      content: element.textContent || '',
      diff_title: diff.title || 'Untitled Diff',
      diff_date: diff.generated_at
    };
  },

  // === Public Diff Sharing ===

  shareDiff(diffId: string): boolean {
    if (!this.profile?.syncedAt) {
      // Profile must be synced to share diffs
      return false;
    }
    const diff = this.history.find((d: Diff) => d.id === diffId);
    if (!diff) return false;

    diff.isPublic = true;
    this.history = [...this.history];
    this._trackModifiedDiff(diffId);
    return true;
  },

  unshareDiff(diffId: string): boolean {
    const diff = this.history.find((d: Diff) => d.id === diffId);
    if (!diff) return false;

    diff.isPublic = false;
    this.history = [...this.history];
    this._trackModifiedDiff(diffId);
    return true;
  },

  isDiffPublic(diffId: string): boolean {
    const diff = this.history.find((d: Diff) => d.id === diffId);
    return diff?.isPublic === true;
  },

  getPublicDiffUrl(diffId: string): string {
    return `${window.location.origin}/d?${diffId}`;
  },

  // === Sync Change Tracking ===

  _getPendingSync(): PendingChanges | null {
    if (!this.activeProfileId) return null;
    if (!this.pendingSync[this.activeProfileId]) {
      this.pendingSync = {
        ...this.pendingSync,
        [this.activeProfileId]: createEmptyPending()
      };
    }
    return this.pendingSync[this.activeProfileId];
  },

  _trackProfileModified() {
    const pending = this._getPendingSync();
    if (!pending || !this.profile?.syncedAt) return;
    pending.profileModified = true;
    this.pendingSync = { ...this.pendingSync };
    this._scheduleAutoSync();
  },

  _autoSyncTimeout: null as ReturnType<typeof setTimeout> | null,
  _scheduleAutoSync() {
    if (this._autoSyncTimeout) clearTimeout(this._autoSyncTimeout);
    this._autoSyncTimeout = setTimeout(() => this.autoSync(), 2000);
  },

  _trackModifiedDiff(id: string) {
    if (!this.activeProfileId || !this.profile?.syncedAt) return;
    const pending = this._getPendingSync();
    if (!pending) return;
    this.pendingSync = {
      ...this.pendingSync,
      [this.activeProfileId]: trackChange(pending, 'diff', 'modified', id)
    };
    this._scheduleAutoSync();
  },

  _trackDeletedDiff(id: string) {
    if (!this.activeProfileId || !this.profile?.syncedAt) return;
    const pending = this._getPendingSync();
    if (!pending) return;
    this.pendingSync = {
      ...this.pendingSync,
      [this.activeProfileId]: trackChange(pending, 'diff', 'deleted', id)
    };
    this._scheduleAutoSync();
  },

  _trackModifiedStar(id: string) {
    if (!this.activeProfileId || !this.profile?.syncedAt) return;
    const pending = this._getPendingSync();
    if (!pending) return;
    this.pendingSync = {
      ...this.pendingSync,
      [this.activeProfileId]: trackChange(pending, 'star', 'modified', id)
    };
    this._scheduleAutoSync();
  },

  _trackDeletedStar(id: string) {
    if (!this.activeProfileId || !this.profile?.syncedAt) return;
    const pending = this._getPendingSync();
    if (!pending) return;
    this.pendingSync = {
      ...this.pendingSync,
      [this.activeProfileId]: trackChange(pending, 'star', 'deleted', id)
    };
    this._scheduleAutoSync();
  },

  _clearPendingSync() {
    if (!this.activeProfileId) return;
    this.pendingSync = {
      ...this.pendingSync,
      [this.activeProfileId]: createEmptyPending()
    };
  },

  hasPendingChanges(): boolean {
    return checkPending(this._getPendingSync());
  },

  // === Optional Sharing/Sync (requires password) ===

  async shareProfile(password: string): Promise<string> {
    if (!this.activeProfileId || !this.profile) throw new Error('No active profile');

    const { passwordSalt, salt } = await shareProfileApi(
      this.activeProfileId,
      this.profile,
      password
    );

    this.updateProfile({ salt, passwordSalt });
    this._syncPassword = password;

    // Mark all existing content as modified so it gets uploaded
    if (this.history.length > 0 || this.stars.length > 0) {
      const allDiffIds = this.history.map((d: Diff) => d.id);
      const allStarIds = this.stars.map((s: Star) => starId(s));
      this.pendingSync = {
        ...this.pendingSync,
        [this.activeProfileId]: {
          modifiedDiffs: allDiffIds,
          modifiedStars: allStarIds,
          deletedDiffs: [],
          deletedStars: []
        }
      };

      try {
        await this.uploadContent(password);
      } catch (e) {
        console.error('Failed to upload content during share:', e);
      }
    }

    return this.activeProfileId;
  },

  async importProfile(id: string, password: string) {
    const { profile } = await importProfileApi(id, password);

    this.profiles = { ...this.profiles, [id]: profile };
    this.histories = { ...this.histories, [id]: [] };
    this.bookmarks = { ...this.bookmarks, [id]: [] };
    this.activeProfileId = id;
    this._syncPassword = password;

    try {
      await this.downloadContent(password);
    } catch {
      // Content download is non-critical on import
    }
  },

  setSyncPassword(password: string) {
    this._syncPassword = password;
  },

  async uploadContent(password: string): Promise<{ uploaded: number }> {
    if (!this.activeProfileId || !this.profile?.syncedAt) {
      throw new Error('Profile not synced to server');
    }

    if (!this.hasPendingChanges()) {
      return { uploaded: 0 };
    }

    this.syncing = true;
    this.syncError = null;

    try {
      const uploadedPending = this._getPendingSync() || createEmptyPending();
      const result = await uploadContent(
        this.activeProfileId,
        this.profile,
        this.history,
        this.stars,
        uploadedPending,
        password
      );

      this.updateProfile({
        syncedAt: new Date().toISOString(),
        diffsHash: result.diffsHash,
        starsHash: result.starsHash
      });

      // Only clear items that were actually uploaded, preserve changes made during sync
      const currentPending = this._getPendingSync() || createEmptyPending();
      this.pendingSync = {
        ...this.pendingSync,
        [this.activeProfileId]: {
          modifiedDiffs: currentPending.modifiedDiffs.filter(id => !uploadedPending.modifiedDiffs.includes(id)),
          modifiedStars: currentPending.modifiedStars.filter(id => !uploadedPending.modifiedStars.includes(id)),
          deletedDiffs: currentPending.deletedDiffs.filter(id => !uploadedPending.deletedDiffs.includes(id)),
          deletedStars: currentPending.deletedStars.filter(id => !uploadedPending.deletedStars.includes(id)),
          profileModified: currentPending.profileModified && !uploadedPending.profileModified
        }
      };

      this.syncStatus = {
        exists: true,
        diffs_hash: result.diffsHash,
        stars_hash: result.starsHash,
        content_updated_at: new Date().toISOString()
      };

      return { uploaded: result.uploaded };
    } finally {
      this.syncing = false;
    }
  },

  async downloadContent(password: string): Promise<{ downloaded: number }> {
    if (!this.activeProfileId || !this.profile?.syncedAt) {
      throw new Error('Profile not synced to server');
    }

    this.syncing = true;
    this.syncError = null;

    try {
      const pending = this._getPendingSync() || createEmptyPending();
      const result = await downloadContent(
        this.activeProfileId,
        this.profile,
        this.history,
        this.stars,
        pending,
        password,
        this.profile.diffsHash,
        this.profile.starsHash
      );

      // Apply downloaded data
      this.history = result.diffs;
      this.stars = result.stars;

      // Apply profile updates if any
      if (result.profileUpdates && this.activeProfileId) {
        const current = this.profiles[this.activeProfileId];
        this.profiles = {
          ...this.profiles,
          [this.activeProfileId]: { ...current, ...result.profileUpdates }
        };
      }

      // Update sync status
      this.updateProfile({
        syncedAt: new Date().toISOString(),
        salt: this.profile.salt,
        diffsHash: result.diffsHash,
        starsHash: result.starsHash
      });

      // Update pending sync
      if (this.activeProfileId) {
        this.pendingSync = {
          ...this.pendingSync,
          [this.activeProfileId]: result.remainingPending
        };
      }

      this.syncStatus = {
        exists: true,
        diffs_hash: result.diffsHash,
        stars_hash: result.starsHash,
        content_updated_at: new Date().toISOString()
      };

      return { downloaded: result.downloaded };
    } finally {
      this.syncing = false;
    }
  },

  async syncContent(password: string): Promise<{ uploaded: number; downloaded: number; status: 'synced' | 'uploaded' | 'downloaded' }> {
    if (!this.activeProfileId || !this.profile?.syncedAt) {
      throw new Error('Profile not synced to server');
    }

    // Don't cache password until sync succeeds
    const downloadResult = await this.downloadContent(password);
    const uploadResult = await this.uploadContent(password);

    // Password verified - now cache it
    this._syncPassword = password;

    let status: 'synced' | 'uploaded' | 'downloaded' = 'synced';
    if (uploadResult.uploaded > 0 && downloadResult.downloaded === 0) status = 'uploaded';
    else if (downloadResult.downloaded > 0 && uploadResult.uploaded === 0) status = 'downloaded';

    return {
      uploaded: uploadResult.uploaded,
      downloaded: downloadResult.downloaded,
      status
    };
  },

  async checkSyncNeeded(): Promise<boolean> {
    if (!this.activeProfileId || !this.profile?.syncedAt) return false;

    try {
      const res = await fetch(`/api/profile/${this.activeProfileId}/sync`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.needs_sync === true;
    } catch {
      return false;
    }
  },

  async autoSync(): Promise<void> {
    // Clear any pending scheduled sync since we're syncing now
    if (this._autoSyncTimeout) {
      clearTimeout(this._autoSyncTimeout);
      this._autoSyncTimeout = null;
    }
    if (!this._syncPassword || !this.profile?.syncedAt) return;
    if (this.syncing) return;

    const password = this._syncPassword;
    try {
      await this.downloadContent(password);
      if (this.hasPendingChanges()) {
        await this.uploadContent(password);
      }
    } catch (e: unknown) {
      console.error('Auto-sync failed:', e);
      // On auth error, clear cached password to stop retry loop
      if (e instanceof ApiError && e.status === 401) {
        setSyncPassword(null);
        if (this.activeProfileId) {
          clearRememberedPassword(this.activeProfileId);
        }
        this._passwordVersion++;
        this.syncError = 'Invalid password';
      } else if (e instanceof ApiError && e.status === 429) {
        this.syncError = e.message;
      } else {
        this.syncError = e instanceof Error ? e.message : 'Auto-sync failed';
      }
    }
  },

  async updatePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!this.activeProfileId || !this.profile) {
      throw new Error('No active profile');
    }
    if (!this.profile.syncedAt) {
      throw new Error('Profile not synced to server');
    }
    if (this.syncing) {
      throw new Error('Sync in progress, please wait');
    }

    this.syncing = true;
    this.syncError = null;

    try {
      const { passwordSalt, salt } = await updatePasswordApi(
        this.activeProfileId,
        this.profile,
        this.history,
        this.stars,
        oldPassword,
        newPassword
      );

      // Update local profile with new salts
      this.updateProfile({ salt, passwordSalt });

      // Update session cached password
      this._syncPassword = newPassword;

      // Clear pending changes (everything was just synced)
      this._clearPendingSync();

      // Update sync status
      this.updateProfile({ syncedAt: new Date().toISOString() });
    } finally {
      this.syncing = false;
    }
  },
});
