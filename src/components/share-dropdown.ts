import Alpine from 'alpinejs';

Alpine.data('shareDropdown', () => ({
  isOpen: false,
  copied: false,

  get diff() {
    return (this as any).$data.diffRef;
  },

  get canShare(): boolean {
    // Show share icon if profile is synced (even if paused)
    return !!(this as any).$store.app.profile?.syncedAt;
  },

  get canModify(): boolean {
    // Can only change share status if password is cached
    return !!(this as any).$store.app._syncPassword;
  },

  get isPublic(): boolean {
    return this.diff?.isPublic === true;
  },

  toggle() {
    this.isOpen = !this.isOpen;
    this.copied = false;
  },

  close() {
    this.isOpen = false;
    this.copied = false;
  },

  async share() {
    if (!this.diff) return;
    if ((this as any).$store.app.shareDiff(this.diff.id)) {
      await (this as any).$store.app.autoSync();
    }
  },

  async unshare() {
    if (!this.diff) return;
    if ((this as any).$store.app.unshareDiff(this.diff.id)) {
      await (this as any).$store.app.autoSync();
      this.close();
    }
  },

  get publicUrl(): string {
    if (!this.diff) return '';
    return (this as any).$store.app.getPublicDiffUrl(this.diff.id);
  },

  copyLink() {
    navigator.clipboard.writeText(this.publicUrl);
    this.copied = true;
    setTimeout(() => { this.copied = false; }, 2000);
  }
}));
