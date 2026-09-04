import { useEffect, useState, useCallback, useRef } from 'react';
import { useDeliveryStore } from '../store/deliveryStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { Bell, Volume2, CheckCircle, X, MapPin, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export default function DeliveryPushNotificationManager() {
  const { user, isAuthorized, isOnline, acceptDelivery, declineDelivery } = useDeliveryStore();
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [urgentAssignment, setUrgentAssignment] = useState<any | null>(null);
  const isRegisteredRef = useRef(false);

  // Create Android Notification Channels
  const createChannels = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await PushNotifications.createChannel({
        id: 'olive_delivery_assignment',
        name: 'Delivery Assignments',
        description: 'Urgent delivery assignment alerts with ringing. Wakes screen.',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'delivery_chime',
      });
      await PushNotifications.createChannel({
        id: 'olive_system',
        name: 'System Alerts',
        description: 'System and order updates',
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: 'system_alert',
      });
    } catch (e) {
      console.warn('[Delivery PushManager] Channel creation notice:', e);
    }
  }, []);

  // Token Registration (Native Android/iOS + Web Push)
  const registerToken = useCallback(async () => {
    if (isRegisteredRef.current || !user) return;

    try {
      if (Capacitor.isNativePlatform()) {
        await createChannels();

        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === ('prompt-with-rationale' as any)) {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          console.warn('[Delivery PushManager] Native push permission not granted');
          return;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (pushToken) => {
          if (pushToken.value) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: pushToken.value,
                platform: Capacitor.getPlatform(),
                deviceName: `${Capacitor.getPlatform().toUpperCase()} Rider Device`,
                appName: 'delivery',
                role: 'delivery'
              })
            }).catch(() => {});
            isRegisteredRef.current = true;
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Delivery PushManager] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Delivery PushManager] Push received in foreground:', notification);
          SoundAlertEngine.startContinuousAlarm();
        });

        await PushNotifications.register();
        return;
      }

      // Web Push via Service Worker & Firebase Messaging
      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => null);
        const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
        const { app } = await import('../lib/firebase');
        const supported = await isSupported().catch(() => false);
        if (supported) {
          const messaging = getMessaging(app);
          const currentToken = await getToken(messaging, {
            vapidKey: 'BDfxvZSqSw6Es3dvXz4VZMwjNFKMCCfRSgdCVty3rfqqBZ6AAWFlZ2EwWQR8ltp6DRMTUKOmH9Rlu0fjCziOKDk',
            serviceWorkerRegistration: swReg || undefined
          }).catch(() => null);

          if (currentToken) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: currentToken,
                platform: 'web',
                browser: navigator.userAgent,
                deviceName: navigator.platform || 'Rider Web Device',
                appName: 'delivery',
                role: 'delivery'
              })
            });
            isRegisteredRef.current = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Delivery PushManager] Token registration warning:', err.message);
    }
  }, [user, createChannels]);

  // 1. Check permission on Auth
  useEffect(() => {
    if (!user || !isAuthorized) return;

    NotificationPermissionManager.checkPermission().then((info) => {
      if (info.state === 'NOT_DETERMINED') {
        setShowPromptBanner(true);
      } else if (info.state === 'GRANTED') {
        registerToken();
      }
    });
  }, [user, isAuthorized, registerToken]);

  // BroadcastChannel listener for Service Worker background alerts
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('olive_pizza_notifications');
    channel.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'START_ALERT') {
        SoundAlertEngine.startContinuousAlarm();
      } else if (data.type === 'STOP_ALERT') {
        SoundAlertEngine.stopAlarm();
      }
    };
    return () => {
      channel.close();
    };
  }, []);

  const handleEnablePermission = async () => {
    SoundAlertEngine.unlockAudio();
    SoundAlertEngine.playSound('test');
    const res = await NotificationPermissionManager.requestPermission();
    setShowPromptBanner(false);

    if (res.state === 'GRANTED') {
      toast.success('Urgent delivery alerts and audio enabled!');
      await registerToken();
    } else if (res.state === 'BLOCKED') {
      toast.error('Notifications blocked. Please allow them in phone settings.');
    }
  };

  // 3. Realtime Listener for Urgent Assignments to this Rider
  useEffect(() => {
    if (!user || !isAuthorized || !isOnline) return;

    const q = query(
      collection(db, 'orders'),
      where('deliveryPartnerId', '==', user.uid),
      where('status', 'in', ['partner_assigned', 'ready'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const order = { id: change.doc.id, ...change.doc.data() } as any;
          // If status is partner_assigned and not yet accepted
          if (order.status === 'partner_assigned' && !order.acceptedAt) {
            const eventId = `delivery_assign:${order.id}:${order.version || 1}`;
            if (NotificationDeduplicator.shouldProcess(eventId)) {
              SoundAlertEngine.startContinuousAlarm();
              setUrgentAssignment(order);
            }
          }
        }
      });
    }, (err) => {
      console.warn('[Delivery PushManager] Realtime listener error:', err);
    });

    return () => unsubscribe();
  }, [user, isAuthorized, isOnline]);

  const handleAccept = async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setUrgentAssignment(null);
    const ok = await acceptDelivery(orderId);
    if (ok) {
      SoundAlertEngine.playSound('order_accepted');
      toast.success('Assignment accepted! Navigate to restaurant.');
    } else {
      toast.error('Failed to accept delivery.');
    }
  };

  const handleDecline = async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setUrgentAssignment(null);
    const ok = await declineDelivery(orderId);
    if (ok) {
      toast('Delivery assignment declined', { icon: 'ℹ️' });
    }
  };

  const handleSilence = () => {
    SoundAlertEngine.stopAlarm();
  };

  return (
    <>
      {/* Educational Permission Banner for Riders */}
      {showPromptBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-40 bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-white animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-300">Enable Urgent Delivery Rings</h4>
                <button onClick={() => setShowPromptBanner(false)} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Allow notifications and ringing so your phone alerts you immediately when a restaurant manager assigns an order.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleEnablePermission}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Enable Rings & Alerts
                </button>
                <button
                  onClick={() => setShowPromptBanner(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* High-Urgency Delivery Alert Modal with ACCEPT & DECLINE */}
      {urgentAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#0F172A] border-2 border-amber-500 rounded-3xl p-6 shadow-2xl shadow-amber-500/25 text-white relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                <span className="text-xs font-black tracking-wider uppercase text-amber-400">New Delivery Assignment!</span>
              </div>
              <button onClick={handleSilence} className="p-1 text-slate-400 hover:text-white">
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white">
                    #{urgentAssignment.orderNumber || urgentAssignment.dailyOrderNumber || urgentAssignment.id?.slice(-6).toUpperCase()}
                  </h3>
                  <span className="text-xs text-slate-400">
                    {urgentAssignment.items?.length || 1} items • {urgentAssignment.paymentMethod || 'COD'}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-emerald-400">
                    ₹{urgentAssignment.finalTotal || urgentAssignment.totalAmount}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Order Value</span>
                </div>
              </div>

              {/* Pickup location */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-start gap-2 text-xs">
                  <Navigation className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-200 block">Pickup: Olive Pizza (Main Branch)</strong>
                    <span className="text-[11px] text-slate-400">Gokul Nagar, Rajnandgaon</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-xs border-t border-slate-800/80 pt-2">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-200 block">Deliver to: {urgentAssignment.customerName || 'Customer'}</strong>
                    <span className="text-[11px] text-slate-400 line-clamp-2">
                      {typeof urgentAssignment.deliveryAddress === 'string' 
                        ? urgentAssignment.deliveryAddress 
                        : urgentAssignment.deliveryAddress?.addressLine || 'Rajnandgaon Area'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Atomic Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleAccept(urgentAssignment.id)}
                className="flex-1 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm tracking-wide transition shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 active:scale-95"
              >
                <CheckCircle className="w-5 h-5" /> ACCEPT
              </button>
              <button
                onClick={() => handleDecline(urgentAssignment.id)}
                className="px-5 py-4 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 font-bold text-sm transition active:scale-95"
              >
                DECLINE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
