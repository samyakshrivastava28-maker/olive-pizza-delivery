/**
 * NotificationPermissionManager.ts
 *
 * Production-grade notification permission state machine:
 * NOT_DETERMINED | GRANTED | DENIED | BLOCKED | UNSUPPORTED
 */

export type NotificationPermissionState =
  | 'NOT_DETERMINED'
  | 'GRANTED'
  | 'DENIED'
  | 'BLOCKED'
  | 'UNSUPPORTED';

export interface NotificationPermissionInfo {
  state: NotificationPermissionState;
  platform: 'android' | 'ios' | 'web' | 'electron';
  canPrompt: boolean;
  requiresSettings: boolean;
  soundEnabled: boolean;
}

export class NotificationPermissionManager {
  static getPlatform(): 'android' | 'ios' | 'web' | 'electron' {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return 'electron';
    }
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      return cap.getPlatform() === 'ios' ? 'ios' : 'android';
    }
    return 'web';
  }

  static async checkPermission(): Promise<NotificationPermissionInfo> {
    const platform = this.getPlatform();

    if (platform === 'electron') {
      return {
        state: 'GRANTED',
        platform: 'electron',
        canPrompt: false,
        requiresSettings: false,
        soundEnabled: true,
      };
    }

    if (platform === 'android' || platform === 'ios') {
      const PushNotifications = (window as any).Capacitor?.Plugins?.PushNotifications;
      if (PushNotifications && typeof PushNotifications.checkPermissions === 'function') {
        try {
          const status = await PushNotifications.checkPermissions();
          if (status.receive === 'granted') {
            return {
              state: 'GRANTED',
              platform,
              canPrompt: false,
              requiresSettings: false,
              soundEnabled: true,
            };
          }
          if (status.receive === 'denied') {
            return {
              state: 'BLOCKED',
              platform,
              canPrompt: false,
              requiresSettings: true,
              soundEnabled: false,
            };
          }
          return {
            state: 'NOT_DETERMINED',
            platform,
            canPrompt: true,
            requiresSettings: false,
            soundEnabled: true,
          };
        } catch {}
      }
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return {
        state: 'UNSUPPORTED',
        platform: 'web',
        canPrompt: false,
        requiresSettings: false,
        soundEnabled: false,
      };
    }

    const perm = Notification.permission;
    if (perm === 'granted') {
      return {
        state: 'GRANTED',
        platform: 'web',
        canPrompt: false,
        requiresSettings: false,
        soundEnabled: true,
      };
    }
    if (perm === 'denied') {
      return {
        state: 'BLOCKED',
        platform: 'web',
        canPrompt: false,
        requiresSettings: true,
        soundEnabled: false,
      };
    }
    return {
      state: 'NOT_DETERMINED',
      platform: 'web',
      canPrompt: true,
      requiresSettings: false,
      soundEnabled: true,
    };
  }

  static async requestPermission(): Promise<NotificationPermissionInfo> {
    const platform = this.getPlatform();

    if (platform === 'electron') {
      return this.checkPermission();
    }

    if (platform === 'android' || platform === 'ios') {
      const PushNotifications = (window as any).Capacitor?.Plugins?.PushNotifications;
      if (PushNotifications && typeof PushNotifications.requestPermissions === 'function') {
        try {
          const res = await PushNotifications.requestPermissions();
          if (res.receive === 'granted') {
            await PushNotifications.register().catch(() => {});
            return {
              state: 'GRANTED',
              platform,
              canPrompt: false,
              requiresSettings: false,
              soundEnabled: true,
            };
          }
          return {
            state: 'BLOCKED',
            platform,
            canPrompt: false,
            requiresSettings: true,
            soundEnabled: false,
          };
        } catch {}
      }
    }

    if (!('Notification' in window)) {
      return {
        state: 'UNSUPPORTED',
        platform: 'web',
        canPrompt: false,
        requiresSettings: false,
        soundEnabled: false,
      };
    }

    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        return {
          state: 'GRANTED',
          platform: 'web',
          canPrompt: false,
          requiresSettings: false,
          soundEnabled: true,
        };
      }
      return {
        state: 'BLOCKED',
        platform: 'web',
        canPrompt: false,
        requiresSettings: true,
        soundEnabled: false,
      };
    } catch {
      return {
        state: 'DENIED',
        platform: 'web',
        canPrompt: false,
        requiresSettings: true,
        soundEnabled: false,
      };
    }
  }

  static async openSettingsInstructions(): Promise<string> {
    const platform = this.getPlatform();
    if (platform === 'android' || platform === 'ios') {
      const App = (window as any).Capacitor?.Plugins?.App;
      if (App && typeof App.openAppSettings === 'function') {
        try {
          await App.openAppSettings();
          return 'Opening device app settings...';
        } catch {}
      }
      return 'Please open phone Settings > Apps > Olive Pizza Delivery > Notifications and select Allow.';
    }
    return 'Click the padlock or site settings icon beside the URL in your browser address bar and enable Notifications.';
  }
}
