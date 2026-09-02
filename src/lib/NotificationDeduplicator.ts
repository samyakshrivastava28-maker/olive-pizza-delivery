/**
 * NotificationDeduplicator.ts
 *
 * Prevents duplicate sounds, modals, and push handling for Delivery Riders.
 */

const STORAGE_KEY = 'olive_rider_processed_events_v1';
const EXPIRY_MS = 10 * 60 * 1000;

interface EventRecord {
  id: string;
  timestamp: number;
}

export class NotificationDeduplicator {
  private static memoryCache = new Set<string>();

  static isDuplicate(eventId: string): boolean {
    if (!eventId) return false;

    if (this.memoryCache.has(eventId)) {
      return true;
    }

    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const events: EventRecord[] = JSON.parse(stored);
        const now = Date.now();
        const validEvents = events.filter(e => (now - e.timestamp) < EXPIRY_MS);
        if (validEvents.some(e => e.id === eventId)) {
          this.memoryCache.add(eventId);
          return true;
        }
      }
    } catch {}

    return false;
  }

  static record(eventId: string): void {
    if (!eventId) return;
    this.memoryCache.add(eventId);

    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      let events: EventRecord[] = stored ? JSON.parse(stored) : [];
      const now = Date.now();
      events = events.filter(e => (now - e.timestamp) < EXPIRY_MS);
      events.push({ id: eventId, timestamp: now });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {}
  }

  static shouldProcess(eventId: string): boolean {
    if (this.isDuplicate(eventId)) {
      return false;
    }
    this.record(eventId);
    return true;
  }
}
