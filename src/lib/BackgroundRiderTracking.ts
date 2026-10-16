import { Capacitor, registerPlugin } from '@capacitor/core';

interface RiderTrackingPlugin {
  start(options: { uid: string }): Promise<void>;
  stop(): Promise<void>;
}
const nativeTracking = registerPlugin<RiderTrackingPlugin>('RiderBackgroundTracking');

/**
 * Android's native foreground service keeps location reporting alive while
 * the app activity is backgrounded. iOS uses its native location capability
 * and remains governed by iOS background/force-quit behavior.
 */
export async function startRiderBackgroundTracking(uid?: string | null): Promise<void> {
  if (Capacitor.getPlatform() !== 'android' || !uid) return;
  await nativeTracking.start({ uid });
}

export async function stopRiderBackgroundTracking(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await nativeTracking.stop();
}
