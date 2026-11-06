import { fetchApi } from './api';

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
 * 🛰️ Olive Pizza Delivery Capacity-Safe GPS Buffer & Transport
 * 
 * Complies with Section 2 & 8:
 * - Online, no active delivery: 5 seconds interval
 * - Online, active delivery: 3 seconds interval
 * - Offline: 0 seconds (Transmission halted)
 * - Eliminates Supabase dependency; streams directly to central backend Redis GPS pipeline.
 */
class OfflineGpsBufferService {
  private static readonly STORAGE_KEY = 'olive_rider_offline_gps_queue';
  private static readonly MAX_BUFFER_SIZE = 20; // Bound queue to prevent memory leaks
  private isFlushing = false;
  private lastSentTime = 0;
  private flushTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[GPS HotPath] Network reconnected. Flushing latest position to Backend...');
        this.flush();
      });
    }
  }

  /**
   * Enqueue a GPS location breadcrumb with dynamic frequency throttling:
   * - 3.0 seconds when delivering an active order
   * - 5.0 seconds when online without an active order
   */
  public enqueue(point: Omit<BufferedGpsPoint, 'id' | 'timestamp'>) {
    const queue = this.getQueue();
    const entry: BufferedGpsPoint = {
      ...point,
      id: `gps_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };

    // FIFO discard if full
    if (queue.length >= OfflineGpsBufferService.MAX_BUFFER_SIZE) {
      queue.shift();
    }
    queue.push(entry);
    this.saveQueue(queue);

    if (!navigator.onLine) {
      return;
    }

    // Required intervals: 3s during delivery, 5s when idle online
    const minIntervalMs = point.activeOrderId ? 3000 : 5000;
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
   * Flush latest GPS point to central backend Redis pipeline.
   * Discards intermediate points to prevent Redis stampedes upon reconnection.
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
        this.saveQueue([]);
        return;
      }

      // ── Stream to Central Backend Redis GPS Pipeline ──
      const res = await fetchApi('/api/v1/tracking/location/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: riderId,
          orderId: latestPoint.activeOrderId || null,
          latitude: Number(latestPoint.lat),
          longitude: Number(latestPoint.lng),
          heading: Number(latestPoint.heading || 0),
          speed: Number(latestPoint.speed || 0),
          accuracy: Number(latestPoint.accuracy || 5),
          timestamp: latestPoint.timestamp
        })
      });

      if (res && res.success !== false) {
        this.lastSentTime = Date.now();
        this.saveQueue([]);
      } else {
        // Fallback to legacy delivery route if v1 path throttled
        const fallbackRes = await fetchApi('/api/delivery/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: latestPoint.lat,
            lng: latestPoint.lng,
            heading: latestPoint.heading,
            speed: latestPoint.speed,
            accuracy: latestPoint.accuracy,
            activeOrderId: latestPoint.activeOrderId
          })
        });
        if (fallbackRes && fallbackRes.success !== false) {
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
      console.warn('[GPS Buffer] LocalStorage save warning:', e);
    }
  }

  public clear() {
    try {
      localStorage.removeItem(OfflineGpsBufferService.STORAGE_KEY);
    } catch {}
  }
}

export const offlineGpsBuffer = new OfflineGpsBufferService();
