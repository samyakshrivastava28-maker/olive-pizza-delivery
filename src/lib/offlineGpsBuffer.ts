import { fetchApi } from './api';
import { supabase } from './supabase';

export interface BufferedGpsPoint {
  id: string;
  riderId?: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  accuracy?: number;
  activeOrderId: string | null;
  timestamp: string;
}

/**
 * 🛰️ Olive Pizza Delivery Offline GPS Buffer & Direct Hot-Path Transport
 * 
 * STRICT ARCHITECTURAL INVARIANT (Sections 10 & 11):
 * High-frequency GPS coordinates stream directly to Supabase Realtime / WebSocket.
 * Coordinates DO NOT route through Node/Express per coordinate.
 * If offline or disconnected, breadcrumbs are buffered locally and flushed immediately upon reconnect.
 */
class OfflineGpsBufferService {
  private static readonly STORAGE_KEY = 'olive_rider_offline_gps_queue';
  private static readonly MAX_BUFFER_SIZE = 50; // Cap to prevent unbounded storage
  private isFlushing = false;
  private lastSentTime = 0;
  private flushTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[GPS HotPath] Network reconnected. Flushing offline buffer to Supabase...');
        this.flush();
      });
    }
  }

  /**
   * Enqueue a GPS location breadcrumb with dynamic frequency throttling:
   * - 1.5 seconds when delivering an active order (high-frequency turn-by-turn tracking)
   * - 25 seconds when idle online (battery & network conservation)
   */
  public enqueue(point: Omit<BufferedGpsPoint, 'id' | 'timestamp'>) {
    const queue = this.getQueue();
    const entry: BufferedGpsPoint = {
      ...point,
      id: `gps_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };

    // Keep within MAX_BUFFER_SIZE (FIFO discard if full)
    if (queue.length >= OfflineGpsBufferService.MAX_BUFFER_SIZE) {
      queue.shift();
    }
    queue.push(entry);
    this.saveQueue(queue);

    if (!navigator.onLine) {
      return;
    }

    const minIntervalMs = point.activeOrderId ? 1500 : 25000;
    const elapsed = Date.now() - this.lastSentTime;

    if (elapsed >= minIntervalMs) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      this.flush();
    } else if (!this.flushTimer) {
      const waitMs = Math.max(100, minIntervalMs - elapsed);
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, waitMs);
    }
  }

  /**
   * Flush buffered GPS points directly to Supabase Realtime
   * Bypasses Node/Express per coordinate (Sections 10, 11)
   */
  public async flush(): Promise<void> {
    if (this.isFlushing || !navigator.onLine) return;
    const queue = this.getQueue();
    if (queue.length === 0) return;

    this.isFlushing = true;
    try {
      // Pick latest point as authoritative live point
      const latestPoint = queue[queue.length - 1];
      const riderId = latestPoint.riderId;

      if (!riderId) {
        // Discard unassociated points
        this.saveQueue([]);
        return;
      }

      let supabaseSuccess = false;

      // ── HOT PATH: Direct Supabase Write (Bypassing Node API) ──
      if (supabase) {
        try {
          const { error } = await supabase.from('delivery_locations').upsert({
            delivery_partner_id: riderId,
            active_order_id: latestPoint.activeOrderId || null,
            latitude: Number(latestPoint.lat),
            longitude: Number(latestPoint.lng),
            heading: Number(latestPoint.heading || 0),
            speed: Number(latestPoint.speed || 0),
            accuracy: Number(latestPoint.accuracy || 5),
            online_status: true,
            last_updated: new Date().toISOString()
          }, {
            onConflict: 'delivery_partner_id'
          });

          if (!error) {
            supabaseSuccess = true;
            this.lastSentTime = Date.now();
            this.saveQueue([]);
            // Debug log
            // console.log(`[GPS HotPath] Streamed directly to Supabase Realtime (bypassed Node backend)`);
          } else {
            console.warn('[GPS HotPath] Supabase upsert error:', error.message);
          }
        } catch (sErr: any) {
          console.warn('[GPS HotPath] Supabase stream exception:', sErr?.message);
        }
      }

      // If Supabase client unavailable or failed, fallback to Node control endpoint
      if (!supabaseSuccess) {
        const res = await fetchApi('/api/delivery/location', {
          method: 'POST',
          body: JSON.stringify({
            lat: latestPoint.lat,
            lng: latestPoint.lng,
            heading: latestPoint.heading,
            speed: latestPoint.speed,
            accuracy: latestPoint.accuracy,
            activeOrderId: latestPoint.activeOrderId,
            bufferedCount: queue.length
          })
        });

        if (res && res.success !== false) {
          this.lastSentTime = Date.now();
          this.saveQueue([]);
        }
      }
    } catch (err) {
      console.warn('[GPS Buffer] Buffer flush retry later:', err);
    } finally {
      this.isFlushing = false;
    }
  }

  public getQueueLength(): number {
    return this.getQueue().length;
  }

  private getQueue(): BufferedGpsPoint[] {
    try {
      const data = localStorage.getItem(OfflineGpsBufferService.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: BufferedGpsPoint[]) {
    try {
      localStorage.setItem(OfflineGpsBufferService.STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('[GPS Buffer] LocalStorage write error:', e);
    }
  }
}

export const offlineGpsBuffer = new OfflineGpsBufferService();
