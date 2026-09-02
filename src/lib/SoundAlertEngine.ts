/**
 * SoundAlertEngine.ts
 *
 * Audio and alert system for Delivery Partners.
 * Provides urgent delivery alerts, offline tone synthesis, and autoplay unlock.
 */

export type SoundType =
  | 'delivery_urgent'  // High-tempo double chime for new assigned orders
  | 'order_accepted'   // Confirmation chime
  | 'order_ready'      // Pickup bell
  | 'order_delivered'  // Delivery celebration chime
  | 'soft_pop'         // Update tone
  | 'test';            // Test tone

interface SoundSettings {
  muted: boolean;
  volume: number;
}

const SETTINGS_KEY = 'olive_rider_sound_settings_v1';

export class SoundAlertEngine {
  private static audioCtx: AudioContext | null = null;
  private static continuousInterval: any = null;
  private static isAlarmActive = false;

  static getSettings(): SoundSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { muted: false, volume: 0.9 };
  }

  static saveSettings(settings: Partial<SoundSettings>): void {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {}
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

  static playSound(type: SoundType): void {
    this.unlockAudio();
    switch (type) {
      case 'delivery_urgent':
        // High-tempo double chime: B5 -> E6
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
