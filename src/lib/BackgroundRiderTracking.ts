import { Capacitor, registerPlugin } from '@capacitor/core';
import { getApiBaseUrl, PRODUCTION_BACKEND_URL } from './api';

interface RiderTrackingPlugin {
  start(options: { uid: string; apiBaseUrl: string }): Promise<void>;
  stop(): Promise<void>;
}
const nativeTracking = registerPlugin<RiderTrackingPlugin>('RiderBackgroundTracking');

/**
 * Android's native foreground service keeps location reporting alive while
 * the app activity is backgrounded. iOS uses its native location capability
 * and remains governed by iOS background/force-quit behavior.
 */
export async function startRiderBackgroundTracking(uid?: string | null): Promise<void> {
  if (!['android', 'ios'].includes(Capacitor.getPlatform()) || !uid) return;
  await nativeTracking.start({ uid, apiBaseUrl: getApiBaseUrl() || PRODUCTION_BACKEND_URL });
}

export async function stopRiderBackgroundTracking(): Promise<void> {
  if (!['android', 'ios'].includes(Capacitor.getPlatform())) return;
  await nativeTracking.stop();
}
