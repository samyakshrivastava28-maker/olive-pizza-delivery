/**
 * SoundAlertEngine.ts
 *
 * Production audio and alert system for Delivery Partners.
 * Provides urgent delivery dispatch alerts, custom audio file playback,
 * offline tone synthesis, 5 built-in distinct alert sounds, and autoplay unlock.
 */

export type SoundType =
  | 'delivery_urgent'  // High-tempo double chime for new assigned orders
  | 'order_accepted'   // Confirmation chime
  | 'order_ready'      // Pickup bell
  | 'order_delivered'  // Delivery celebration chime
  | 'soft_pop'         // Update tone
  | 'test';            // Test tone

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  file: string;
}

export const ALERT_SOUND_OPTIONS: SoundOption[] = [
  { id: 'ascending_chimes', name: 'Ascending Chimes', description: 'Bright melodic multi-tone chime (Default)', file: '/sounds/delivery_chime.mp3' },
  { id: 'olive_dispatch', name: 'Olive Pizza Dispatch', description: 'Urgent siren for instant orders', file: '/sounds/new_order.mp3' },
  { id: 'harmonic_chord', name: 'Harmonic Chord', description: 'Warm resonant acoustic chord', file: '/sounds/order_confirmed.mp3' },
  { id: 'kitchen_bell', name: 'Kitchen Service Bell', description: 'Crisp high-clarity bell ding', file: '/sounds/success_ding.mp3' },
  { id: 'celebration_fanfare', name: 'Celebration Fanfare', description: 'Uplifting victory fanfare chime', file: '/sounds/order_delivered.mp3' },
];

export const DEFAULT_ALERT_SOUND_ID = 'ascending_chimes';

export interface SoundSettings {
  muted: boolean;
  volume: number;
  vibration: boolean;
  selectedSoundId: string;
}

const SETTINGS_KEY = 'olive_rider_sound_settings_v1';

const DEFAULT_SETTINGS: SoundSettings = {
  muted: false,
  volume: 0.9,
  vibration: true,
  selectedSoundId: DEFAULT_ALERT_SOUND_ID,
};

export class SoundAlertEngine {
  private static audioCtx: AudioContext | null = null;
  private static continuousInterval: any = null;
  private static isAlarmActive = false;
  private static listeners: Set<(settings: SoundSettings) => void> = new Set();

  static getSettings(): SoundSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          selectedSoundId: parsed.selectedSoundId || DEFAULT_ALERT_SOUND_ID,
        };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  static saveSettings(settings: Partial<SoundSettings>): void {
    try {
      const current = this.getSettings();
      const updated: SoundSettings = { ...current, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      this.listeners.forEach((l) => l(updated));
      if (this.isAlarmActive && updated.muted) {
        this.stopAlarm();
      }
    } catch {}
  }

  static subscribeSettings(listener: (settings: SoundSettings) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => {
      this.listeners.delete(listener);
    };
  }

  static getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx!;
  }

  static unlockAudio(): void {
    try {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch {}
  }

  static triggerVibration(pattern: number[] = [300, 150, 300]): void {
    const settings = this.getSettings();
    if (!settings.vibration) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  private static playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    volumeMultiplier = 0.5,
    delaySec = 0
  ) {
    const settings = this.getSettings();
    if (settings.muted) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delaySec);

      const targetVol = Math.max(0.01, Math.min(1.0, settings.volume * volumeMultiplier));
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delaySec);
      gain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + delaySec + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delaySec + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delaySec);
      osc.stop(ctx.currentTime + delaySec + durationSec + 0.02);
    } catch (err) {
      console.warn('[SoundAlertEngine] Audio error:', err);
    }
  }

  private static async playCustomAudio(filePaths: string[]): Promise<void> {
    const settings = this.getSettings();
    if (settings.muted) return;

    for (const path of filePaths) {
      try {
        const audio = new Audio(path);
        audio.volume = settings.volume;
        await audio.play();
        return;
      } catch {
        continue;
      }
    }
    throw new Error('All custom audio files failed to play');
  }

  static async playSound(type: SoundType): Promise<void> {
    this.unlockAudio();
    this.triggerVibration();

    const settings = this.getSettings();
    const selectedOption = ALERT_SOUND_OPTIONS.find((o) => o.id === settings.selectedSoundId) || ALERT_SOUND_OPTIONS[0];

    const soundFilesMap: Record<SoundType, string[]> = {
      delivery_urgent: [selectedOption.file, '/sounds/delivery_chime.mp3', '/sounds/system_alert.mp3'],
      order_accepted: ['/sounds/order_confirmed.mp3', '/sounds/success_ding.mp3'],
      order_ready: ['/sounds/success_ding.mp3', '/sounds/delivery_chime.mp3'],
      order_delivered: ['/sounds/order_delivered.mp3', '/sounds/delivery_completed.mp3'],
      soft_pop: ['/sounds/soft_pop.mp3'],
      test: [selectedOption.file, '/sounds/delivery_chime.mp3', '/sounds/success_ding.mp3'],
    };

    const files = soundFilesMap[type] || [];
    try {
      await this.playCustomAudio(files);
      return;
    } catch {
      this.playSynthesizedTone(type);
    }
  }

  static previewSoundFile(fileUrl: string): void {
    try {
      this.unlockAudio();
      const settings = this.getSettings();
      const audio = new Audio(fileUrl);
      audio.volume = settings.muted ? 0 : settings.volume;
      audio.play().catch(() => {});
    } catch {}
  }

  private static playSynthesizedTone(type: SoundType): void {
    switch (type) {
      case 'delivery_urgent':
        this.playTone(987, 0.2, 'sine', 0.9, 0);
        this.playTone(1318, 0.32, 'triangle', 1.0, 0.14);
        break;
      case 'order_accepted':
        this.playTone(659, 0.2, 'sine', 0.6, 0);
        this.playTone(880, 0.3, 'sine', 0.7, 0.15);
        break;
      case 'order_ready':
        this.playTone(1046, 0.35, 'sine', 0.75, 0);
        break;
      case 'order_delivered':
        this.playTone(784, 0.15, 'sine', 0.6, 0);
        this.playTone(987, 0.15, 'sine', 0.6, 0.12);
        this.playTone(1174, 0.3, 'sine', 0.7, 0.24);
        break;
      case 'soft_pop':
        this.playTone(880, 0.1, 'sine', 0.3, 0);
        break;
      case 'test':
        this.playTone(987, 0.2, 'sine', 0.8, 0);
        this.playTone(1318, 0.3, 'sine', 0.9, 0.15);
        break;
    }
  }

  static startContinuousAlarm(): void {
    if (this.isAlarmActive) return;
    this.stopAlarm();

    this.isAlarmActive = true;
    this.playSound('delivery_urgent');

    this.continuousInterval = setInterval(() => {
      if (this.isAlarmActive) {
        this.playSound('delivery_urgent');
      }
    }, 2200);
  }

  static stopAlarm(): void {
    this.isAlarmActive = false;
    if (this.continuousInterval) {
      clearInterval(this.continuousInterval);
      this.continuousInterval = null;
    }
  }

  static isAlarming(): boolean {
    return this.isAlarmActive;
  }
}

if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'touchstart', 'keydown', 'pointerdown'];
  const handleInteraction = () => {
    SoundAlertEngine.unlockAudio();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, handleInteraction));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, handleInteraction, { passive: true }));
}
