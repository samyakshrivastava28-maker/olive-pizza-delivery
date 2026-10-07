/**
 * 🛰️ LocationService — Authoritative Single-Watcher GPS & Device Connection Layer
 * 
 * Complies with Section 9, 10, 11 of Master Production Repair:
 * 1. Single authoritative GPS watcher (eliminates duplicate watchPosition battery drain).
 * 2. Uses native @capacitor/geolocation on Capacitor Android/iOS, falling back to navigator.geolocation on Web.
 * 3. Clearly distinguishes:
 *    - PERMISSION_DENIED (user rejected prompt)
 *    - SERVICE_DISABLED (device system location is toggled OFF)
 *    - ACQUIRING (permission granted, acquiring satellite lock)
 *    - ACTIVE (accurate GPS fix verified and streaming)
 *    - STALE (signal lost / no update in > 45s)
 *    - OFFLINE (rider toggled offline)
 * 4. Buffers and flushes coordinates directly to Supabase Realtime (bypassing Node per coordinate).
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { offlineGpsBuffer } from '../lib/offlineGpsBuffer';

export type DeviceLocationState =
  | 'UNKNOWN'
  | 'PERMISSION_DENIED'
  | 'SERVICE_DISABLED'
  | 'ACQUIRING'
  | 'ACTIVE'
  | 'STALE'
  | 'OFFLINE';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  accuracy: number;
  timestamp: number;
}

export interface TrackingCallbacks {
  onLocationUpdate?: (coords: LocationCoordinates) => void;
  onStateChange?: (state: DeviceLocationState) => void;
  getActiveOrderId?: () => string | null;
  riderId?: string;
}

class LocationService {
  private static instance: LocationService;

  private activeWatchId: string | number | null = null;
  private isNative: boolean = false;
  private currentState: DeviceLocationState = 'OFFLINE';
  private lastCoordinates: LocationCoordinates | null = null;
  private lastFixTimestamp: number = 0;
  private callbacks: TrackingCallbacks = {};
  private stalenessCheckInterval: any = null;

  private constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  public static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  public getCurrentState(): DeviceLocationState {
    return this.currentState;
  }

  public getState(): DeviceLocationState {
    return this.currentState;
  }

  public setCallbacks(callbacks: Partial<TrackingCallbacks>) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getLastCoordinates(): LocationCoordinates | null {
    return this.lastCoordinates;
  }

  public getLastFixAgeSeconds(): number {
    if (!this.lastFixTimestamp) return -1;
    return Math.round((Date.now() - this.lastFixTimestamp) / 1000);
  }

  /**
   * Diagnostic check of hardware & permission status
   */
  public async checkDeviceStatus(): Promise<{
    state: DeviceLocationState;
    canGoOnline: boolean;
    reason?: string;
  }> {
    if (this.isNative) {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location === 'denied') {
          return { state: 'PERMISSION_DENIED', canGoOnline: false, reason: 'Location permission was denied in device settings.' };
        }
        if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
          const req = await Geolocation.requestPermissions();
          if (req.location === 'denied') {
            return { state: 'PERMISSION_DENIED', canGoOnline: false, reason: 'Location permission was denied by user.' };
          }
        }
        return { state: 'ACQUIRING', canGoOnline: true };
      } catch (err: any) {
        console.warn('[LocationService] Native permission check error:', err?.message);
        return { state: 'SERVICE_DISABLED', canGoOnline: false, reason: err?.message || 'Device location service is off' };
      }
    }

    // Web Platform Check
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return { state: 'SERVICE_DISABLED', canGoOnline: false, reason: 'Browser does not support Geolocation API' };
    }

    if ('permissions' in navigator) {
      try {
        const permStatus = await navigator.permissions.query({ name: 'geolocation' as any });
        if (permStatus.state === 'denied') {
          return { state: 'PERMISSION_DENIED', canGoOnline: false, reason: 'Browser location permission denied' };
        }
      } catch {}
    }

    return { state: 'ACQUIRING', canGoOnline: true };
  }

  /**
   * Request Location Permission
   */
  public async requestPermissions(): Promise<boolean> {
    if (this.isNative) {
      try {
        const res = await Geolocation.requestPermissions();
        return res.location === 'granted';
      } catch {
        return false;
      }
    }

    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(false);
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    });
  }

  /**
   * Start Single Authoritative GPS Watcher
   */
  public async startTracking(callbacks?: TrackingCallbacks): Promise<boolean> {
    if (callbacks) {
      this.callbacks = { ...this.callbacks, ...callbacks };
    }
    this.stopTracking(); // Ensure no duplicate watchers exist

    const status = await this.checkDeviceStatus();
    if (!status.canGoOnline) {
      this.setState(status.state);
      return false;
    }

    this.setState('ACQUIRING');

    // 1. Initial quick fix attempt to verify connection
    try {
      if (this.isNative) {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        });
        this.handlePositionUpdate(pos);
      } else {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              this.handlePositionUpdate(pos);
              resolve();
            },
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
          );
        });
      }
    } catch (err: any) {
      console.warn('[LocationService] Initial position acquiring notice:', err?.message);
      // Don't fail immediately — continuous watcher will catch lock as satellites align
    }

    // 2. Start continuous single watcher
    try {
      if (this.isNative) {
        const watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 3000,
          },
          (position, err) => {
            if (err) {
              this.handleWatchError(err);
              return;
            }
            if (position) {
              this.handlePositionUpdate(position);
            }
          }
        );
        this.activeWatchId = watchId;
      } else {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => this.handlePositionUpdate(pos),
          (err) => this.handleWatchError(err),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
        );
        this.activeWatchId = watchId;
      }

      this.startStalenessWatcher();
      return true;
    } catch (err: any) {
      console.error('[LocationService] Could not attach GPS watcher:', err?.message);
      this.setState('SERVICE_DISABLED');
      return false;
    }
  }

  /**
   * Stop Tracking (Rider Offline)
   */
  public stopTracking() {
    if (this.activeWatchId !== null) {
      if (this.isNative && typeof this.activeWatchId === 'string') {
        Geolocation.clearWatch({ id: this.activeWatchId }).catch(() => {});
      } else if (typeof this.activeWatchId === 'number' && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(this.activeWatchId);
      }
      this.activeWatchId = null;
    }

    if (this.stalenessCheckInterval) {
      clearInterval(this.stalenessCheckInterval);
      this.stalenessCheckInterval = null;
    }

    this.setState('OFFLINE');
  }

  private handlePositionUpdate(pos: Position | GeolocationPosition) {
    const coords: LocationCoordinates = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      heading: pos.coords.heading || 0,
      speed: pos.coords.speed || 0,
      accuracy: pos.coords.accuracy || 5,
      timestamp: pos.timestamp || Date.now(),
    };

    this.lastCoordinates = coords;
    this.lastFixTimestamp = Date.now();
    this.setState('ACTIVE');

    // Notify listeners
    this.callbacks.onLocationUpdate?.(coords);

    // Buffer and stream to Supabase directly
    const activeOrderId = this.callbacks.getActiveOrderId ? this.callbacks.getActiveOrderId() : null;
    offlineGpsBuffer.enqueue({
      riderId: this.callbacks.riderId,
      lat: coords.latitude,
      lng: coords.longitude,
      heading: coords.heading,
      speed: coords.speed,
      accuracy: coords.accuracy,
      activeOrderId,
    });
  }

  private handleWatchError(err: any) {
    console.warn('[LocationService] Watcher event code:', err?.code, err?.message);
    if (err.code === 1) { // PERMISSION_DENIED
      this.setState('PERMISSION_DENIED');
    } else if (err.code === 2) { // POSITION_UNAVAILABLE
      // Only set disabled if we haven't received any recent fix
      if (!this.lastFixTimestamp || Date.now() - this.lastFixTimestamp > 30000) {
        this.setState('SERVICE_DISABLED');
      }
    } else if (err.code === 3) { // TIMEOUT
      // Transient satellite timeout during movement or building obstruction
      if (this.lastFixTimestamp && Date.now() - this.lastFixTimestamp > 45000) {
        this.setState('STALE');
      }
    }
  }

  private startStalenessWatcher() {
    if (this.stalenessCheckInterval) clearInterval(this.stalenessCheckInterval);

    this.stalenessCheckInterval = setInterval(() => {
      if (this.currentState === 'ACTIVE' && this.lastFixTimestamp) {
        const ageMs = Date.now() - this.lastFixTimestamp;
        if (ageMs > 45000) {
          console.warn(`[LocationService] GPS fix stale (${Math.round(ageMs / 1000)}s without update).`);
          this.setState('STALE');
        }
      }
    }, 10000);
  }

  private setState(next: DeviceLocationState) {
    if (this.currentState !== next) {
      this.currentState = next;
      this.callbacks.onStateChange?.(next);
    }
  }
}

export const locationService = LocationService.getInstance();
