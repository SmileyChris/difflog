import Alpine from 'alpinejs';
import { STORAGE_KEYS } from '../lib/constants';

interface ReminderSettings {
  enabled: boolean;
  days: number[];      // 0-6 (Sun-Sat)
  time: string;        // "HH:MM" 24h format
  lastNotified: string; // ISO date
}

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  days: [1, 2, 3, 4, 5], // Mon-Fri
  time: '09:00',
  lastNotified: ''
};

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

Alpine.data('reminders', () => ({
  settings: { ...DEFAULT_SETTINGS } as ReminderSettings,
  permission: 'default' as NotificationPermission,
  swRegistered: false,
  reminderTimeout: null as ReturnType<typeof setTimeout> | null,

  get dayLabels() { return DAY_LABELS; },
  get dayNames() { return DAY_NAMES; },

  init() {
    this.loadSettings();
    this.permission = 'Notification' in window ? Notification.permission : 'denied';

    if (this.settings.enabled && this.permission === 'granted') {
      this.registerServiceWorker();
      this.checkMissedReminder();
      this.scheduleNextReminder();
    }
  },

  loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.REMINDERS);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Use defaults
    }
  },

  saveSettings() {
    localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(this.settings));
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      return;
    }

    const result = await Notification.requestPermission();
    this.permission = result;

    if (result === 'granted') {
      this.settings.enabled = true;
      this.saveSettings();
      await this.registerServiceWorker();
      this.scheduleNextReminder();
    }
  },

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator) || this.swRegistered) return;

    try {
      await navigator.serviceWorker.register('/sw-reminders.js');
      this.swRegistered = true;
    } catch {
      // Service worker registration failed
    }
  },

  toggleDay(day: number) {
    const idx = this.settings.days.indexOf(day);
    if (idx === -1) {
      this.settings.days.push(day);
      this.settings.days.sort((a, b) => a - b);
    } else {
      this.settings.days.splice(idx, 1);
    }
    this.saveSettings();
    this.scheduleNextReminder();
  },

  isDayActive(day: number): boolean {
    return this.settings.days.includes(day);
  },

  updateTime(event: Event) {
    const input = event.target as HTMLInputElement;
    this.settings.time = input.value;
    this.saveSettings();
    this.scheduleNextReminder();
  },

  toggleEnabled() {
    this.settings.enabled = !this.settings.enabled;
    this.saveSettings();

    if (this.settings.enabled) {
      this.scheduleNextReminder();
    } else {
      this.clearScheduledReminder();
    }
  },

  clearScheduledReminder() {
    if (this.reminderTimeout) {
      clearTimeout(this.reminderTimeout);
      this.reminderTimeout = null;
    }
  },

  scheduleNextReminder() {
    this.clearScheduledReminder();

    if (!this.settings.enabled || this.settings.days.length === 0) return;

    const now = new Date();
    const nextTime = this.getNextReminderTime(now);
    if (!nextTime) return;

    const delay = nextTime.getTime() - now.getTime();

    // Only schedule if within 24 hours (reasonable for a session)
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      this.reminderTimeout = setTimeout(() => {
        this.showReminder();
        this.scheduleNextReminder();
      }, delay);
    }
  },

  getNextReminderTime(from: Date): Date | null {
    if (this.settings.days.length === 0) return null;

    const [hours, minutes] = this.settings.time.split(':').map(Number);

    // Check today first
    const today = new Date(from);
    today.setHours(hours, minutes, 0, 0);

    if (today > from && this.settings.days.includes(from.getDay())) {
      return today;
    }

    // Check next 7 days
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(from);
      candidate.setDate(candidate.getDate() + i);
      candidate.setHours(hours, minutes, 0, 0);

      if (this.settings.days.includes(candidate.getDay())) {
        return candidate;
      }
    }

    return null;
  },

  checkMissedReminder() {
    if (!this.settings.enabled || this.settings.days.length === 0) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Already notified today
    if (this.settings.lastNotified === today) return;

    // Check if today is a reminder day
    if (!this.settings.days.includes(now.getDay())) return;

    // Check if the reminder time has passed
    const [hours, minutes] = this.settings.time.split(':').map(Number);
    const reminderTime = new Date(now);
    reminderTime.setHours(hours, minutes, 0, 0);

    if (now > reminderTime) {
      // Missed reminder - show it now
      this.showReminder();
    }
  },

  async showReminder() {
    const today = new Date().toISOString().split('T')[0];
    this.settings.lastNotified = today;
    this.saveSettings();

    // Try to use service worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_REMINDER',
        body: "Time to check what's new in your dev ecosystem!"
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      // Fallback to direct notification
      new Notification('diff·log', {
        body: "Time to check what's new in your dev ecosystem!",
        icon: '/favicon.svg'
      });
    }
  },

}));
