import Alpine from 'alpinejs';

Alpine.data('shareProfile', () => ({
  loading: true,
  error: '',
  profile: null as any,
  showQR: false,
  shareUrl: '',
  copied: false,

  async init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || window.location.pathname.split('/').pop();

    if (!id) {
      this.error = 'No profile ID provided';
      this.loading = false;
      return;
    }

    try {
      const res = await fetch(`/api/share/${id}`);
      if (!res.ok) {
        this.error = 'Profile not found';
        this.loading = false;
        return;
      }
      this.profile = await res.json();
      this.shareUrl = window.location.href;
      this.showQR = true;
    } catch {
      this.error = 'Failed to load profile';
    } finally {
      this.loading = false;
    }
  },

  cloneProfile() {
    if (this.profile) {
      sessionStorage.setItem('cloneProfile', JSON.stringify(this.profile));
      window.location.href = '/setup';
    }
  },

  async copyShareUrl() {
    await navigator.clipboard.writeText(this.shareUrl);
    this.copied = true;
    setTimeout(() => { this.copied = false; }, 2000);
  }
}));
