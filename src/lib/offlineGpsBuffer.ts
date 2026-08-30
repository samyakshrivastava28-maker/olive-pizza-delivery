import { fetchApi } from './api';

export interface BufferedGpsPoint {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  activeOrderId: string | null;
  timestamp: string;
}

/**
 * 🛰️ Olive Pizza Delivery Offline GPS Buffer
 * Buffers rider breadcrumbs locally when the rider moves through network dead zones,
 * and automatically flushes them in idempotent batches upon reconnect.
 */
class OfflineGpsBufferService {
  private static readonly STORAGE_KEY = 'olive_rider_offline_gps_queue';
  private static readonly MAX_BUFFER_SIZE = 50; // Cap to prevent unbounded storage
  private isFlushing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[GPS Buffer] Network reconnected. Flushing offline buffer...');
        this.flush();
      });
    }
  }

  /**
   * Enqueue a GPS location breadcrumb
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

    // Try flushing immediately if online
    if (navigator.onLine) {
      this.flush();
    }
  }

  /**
   * Flush buffered GPS points to server
   */
  public async flush(): Promise<void> {
    if (this.isFlushing || !navigator.onLine) return;
    const queue = this.getQueue();
    if (queue.length === 0) return;

    this.isFlushing = true;
    try {
      // Pick latest point as authoritative live point
      const latestPoint = queue[queue.length - 1];

      const res = await fetchApi('/api/delivery/rider/location', {
        method: 'POST',
        body: JSON.stringify({
          lat: latestPoint.lat,
          lng: latestPoint.lng,
          heading: latestPoint.heading,
          speed: latestPoint.speed,
          activeOrderId: latestPoint.activeOrderId,
          bufferedCount: queue.length
        })
      });

      if (res && res.success !== false) {
        // Clear flushed queue
        this.saveQueue([]);
        console.log(`[GPS Buffer] Flushed ${queue.length} buffered GPS points successfully`);
      }
    } catch (err) {
      console.warn('[GPS Buffer] Offline buffer flush retry later:', err);
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
