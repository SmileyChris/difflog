import Alpine from 'alpinejs';

Alpine.data('profiles', () => ({
  showImport: false,
  importProfileId: '',
  importPassword: '',
  importRemember: true,
  importError: '',
  importing: false,
  showScanner: false,
  scannerError: '',
  scannerStream: null as MediaStream | null,
  scannerInterval: null as ReturnType<typeof setInterval> | null,
  showShare: false,
  shareProfileId: '',
  sharePassword: '',
  sharePasswordConfirm: '',
  shareRemember: true,
  shareError: '',
  sharing: false,
  showInfo: false,
  infoProfileId: '',
  qrDataUrl: '',
  copied: false,
  // Password update state
  showPasswordUpdate: false,
  passwordUpdateProfileId: '',
  currentPassword: '',
  newPassword: '',
  newPasswordConfirm: '',
  passwordUpdateError: '',
  passwordUpdating: false,
  passwordUpdateSuccess: false,

  get profiles() { return (this as any).$store.app.profiles; },
  get activeProfileId() { return (this as any).$store.app.activeProfileId; },
  get syncing() { return (this as any).$store.app.syncing; },

  init() {
    if (sessionStorage.getItem('openImport')) {
      sessionStorage.removeItem('openImport');
      this.showImport = true;
    }
  },

  switchProfile(id: string) {
    (this as any).$store.app.switchProfile(id);
    window.location.href = '/';
  },

  deleteProfile(id: string) {
    const profile = (this as any).$store.app.profiles[id];
    if (confirm(`Delete "${profile?.name || 'this profile'}"? This cannot be undone.`)) {
      (this as any).$store.app.deleteProfile(id);
    }
  },

  async importProfile() {
    const id = this.importProfileId.trim();
    if (!id || !this.importPassword) return;

    this.importError = '';

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      this.importError = 'Invalid profile ID format';
      return;
    }

    this.importing = true;
    try {
      await (this as any).$store.app.importProfile(id, this.importPassword);
      if (this.importRemember) {
        (this as any).$store.app.rememberPassword(this.importPassword);
      }
      window.location.href = '/';
    } catch (e: unknown) {
      this.importError = e instanceof Error ? e.message : 'Failed to import profile';
    } finally {
      this.importing = false;
    }
  },

  startShare(id: string) {
    this.shareProfileId = id;
    this.sharePassword = '';
    this.sharePasswordConfirm = '';
    this.shareError = '';
    this.showShare = true;
  },

  async shareProfile() {
    if (!this.sharePassword || this.sharePassword !== this.sharePasswordConfirm) return;

    this.shareError = '';
    this.sharing = true;

    try {
      (this as any).$store.app.switchProfile(this.shareProfileId);
      await (this as any).$store.app.shareProfile(this.sharePassword);
      const profile = (this as any).$store.app.profiles[this.shareProfileId];
      (this as any).$store.app.profiles = {
        ...(this as any).$store.app.profiles,
        [this.shareProfileId]: { ...profile, syncedAt: new Date().toISOString() }
      };
      if (this.shareRemember) {
        (this as any).$store.app.rememberPassword(this.sharePassword);
      }
      this.showShare = false;
      (this as any).$store.app.checkSyncStatus();
    } catch (e: unknown) {
      this.shareError = e instanceof Error ? e.message : 'Failed to share profile';
    } finally {
      this.sharing = false;
    }
  },

  async showShareInfo(id: string) {
    this.infoProfileId = id;
    this.copied = false;
    this.qrDataUrl = '';
    this.showInfo = true;

    try {
      if (!(window as any).qrcode) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject();
          document.head.appendChild(script);
        });
      }
      const qr = (window as any).qrcode(0, 'M');
      qr.addData(id);
      qr.make();
      this.qrDataUrl = qr.createDataURL(6, 4);
    } catch {
      // QR generation failed, just show ID
    }
  },

  async copyId() {
    try {
      await navigator.clipboard.writeText(this.infoProfileId);
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    } catch {
      // Fallback
    }
  },

  async startScanner() {
    this.scannerError = '';
    this.showScanner = true;

    if (!(window as any).jsQR) {
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load QR scanner'));
          document.head.appendChild(script);
        });
      } catch {
        this.scannerError = 'Failed to load QR scanner library.';
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      this.scannerStream = stream;

      const video = (this as any).$refs.scannerVideo as HTMLVideoElement;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      this.scannerInterval = setInterval(() => {
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = (window as any).jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          const uuidMatch = code.data.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (uuidMatch) {
            this.stopScanner();
            this.importProfileId = uuidMatch[0];
            this.showImport = true;
          }
        }
      }, 150);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError') {
        this.scannerError = 'Camera access denied. Please allow camera access.';
      } else if (error.name === 'NotFoundError') {
        this.scannerError = 'No camera found on this device.';
      } else {
        this.scannerError = `Could not access camera: ${error.message || 'Unknown error'}`;
      }
    }
  },

  stopScanner() {
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval);
      this.scannerInterval = null;
    }
    if (this.scannerStream) {
      this.scannerStream.getTracks().forEach(track => track.stop());
      this.scannerStream = null;
    }
    this.showScanner = false;
    this.scannerError = '';
  },

  startPasswordUpdate(id: string) {
    this.passwordUpdateProfileId = id;
    this.currentPassword = '';
    this.newPassword = '';
    this.newPasswordConfirm = '';
    this.passwordUpdateError = '';
    this.passwordUpdateSuccess = false;
    this.showPasswordUpdate = true;
  },

  async doPasswordUpdate() {
    if (!this.currentPassword || !this.newPassword) return;
    if (this.newPassword !== this.newPasswordConfirm) {
      this.passwordUpdateError = 'Passwords do not match';
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordUpdateError = 'Password must be at least 8 characters';
      return;
    }

    this.passwordUpdateError = '';
    this.passwordUpdating = true;

    try {
      // Switch to the profile if not already active
      if (this.passwordUpdateProfileId !== (this as any).$store.app.activeProfileId) {
        (this as any).$store.app.switchProfile(this.passwordUpdateProfileId);
      }

      await (this as any).$store.app.updatePassword(this.currentPassword, this.newPassword);
      this.passwordUpdateSuccess = true;

      // Close modal after showing success
      setTimeout(() => {
        if (this.passwordUpdateSuccess) {
          this.showPasswordUpdate = false;
          this.passwordUpdateSuccess = false;
        }
      }, 2000);
    } catch (e: unknown) {
      this.passwordUpdateError = e instanceof Error ? e.message : 'Failed to update password';
    } finally {
      this.passwordUpdating = false;
    }
  }
}));
