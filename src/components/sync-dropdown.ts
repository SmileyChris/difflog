import Alpine from 'alpinejs';

// Sync dropdown component
// A compact dropdown for sync status, password entry, and results
Alpine.data('syncDropdown', () => ({
  init() {
    // Close on escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this as any).$store.app.syncDropdownOpen) {
        (this as any).$store.app.closeSyncDropdown();
      }
    });
  },

  get show(): boolean {
    return (this as any).$store.app.profile?.syncedAt;
  },

  get state(): 'local' | 'syncing' | 'pending' | 'synced' {
    return (this as any).$store.app.syncState;
  },

  get isOpen(): boolean {
    return (this as any).$store.app.syncDropdownOpen;
  },

  get syncing(): boolean {
    return (this as any).$store.app.syncing;
  },

  get needsPassword(): boolean {
    return !(this as any).$store.app._syncPassword;
  },

  get lastSyncedAgo(): string {
    return (this as any).$store.app.lastSyncedAgo;
  },

  get error(): string | null {
    return (this as any).$store.app.syncError;
  },

  get result(): { uploaded: number; downloaded: number } | null {
    return (this as any).$store.app.syncResult;
  },

  get password(): string {
    return (this as any).$store.app.syncDropdownPassword;
  },

  set password(val: string) {
    (this as any).$store.app.syncDropdownPassword = val;
  },

  get remember(): boolean {
    return (this as any).$store.app.syncDropdownRemember;
  },

  set remember(val: boolean) {
    (this as any).$store.app.syncDropdownRemember = val;
  },

  get isRemembered(): boolean {
    return (this as any).$store.app.hasRememberedPassword;
  },

  forgetSavedPassword() {
    (this as any).$store.app.forgetPassword();
    this.close();
  },

  toggle() {
    (this as any).$store.app.toggleSyncDropdown();
  },

  close() {
    (this as any).$store.app.closeSyncDropdown();
  },

  async sync() {
    await (this as any).$store.app.doSyncFromDropdown();
  },

  handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.sync-dropdown-wrapper')) {
      this.close();
    }
  }
}));
