import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeliveryStore } from '../store/deliveryStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { Bell, Volume2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export default function DeliveryPushNotificationManager() {
  const navigate = useNavigate();
  const { user, isAuthorized, isOnline } = useDeliveryStore();
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const isRegisteredRef = useRef(false);
  const registeredTokenRef = useRef<string | null>(null);

  // Create Android Notification Channels
  const createChannels = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await PushNotifications.createChannel({
        id: 'olive_delivery_alarm_v3',
        name: 'Delivery Alarm (v3)',
        description: 'Urgent delivery assignment alarm. Rings continuously and wakes screen.',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'delivery_chime',
      });
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
        id: 'olive_delivery_updates',
        name: 'Live Delivery Order Status',
        description: 'Persistent status notifications for active delivery assignments.',
        importance: 4,
        visibility: 1,
        vibration: false,
        sound: 'delivery_chime',
      });
      await PushNotifications.createChannel({
        id: 'olive_order_completed_v2',
        name: 'Delivery Completed (v2)',
        description: 'Delivered and completed delivery confirmations.',
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: 'order_delivered',
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
            registeredTokenRef.current = pushToken.value;
            isRegisteredRef.current = true;
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Delivery PushManager] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', async (notification) => {
          console.log('[Delivery PushManager] Push received in foreground:', notification);
          SoundAlertEngine.startContinuousAlarm();
          const data = (notification.data || {}) as Record<string, any>;
          const orderId = String(data.orderId || data.order_id || data.id || '');

          // INVARIANT (PHASES 28-30): Push notification payload cannot be treated as authoritative order data.
          // Notification only signals WHICH order changed; authoritative order data must be verified against
          // Firestore / backend before being used for delivery operations.
          let authoritativeOrder: any = null;
          if (orderId) {
            try {
              const orderDocSnap = await getDoc(doc(db, 'orders', orderId));
              if (orderDocSnap.exists()) {
                authoritativeOrder = { id: orderDocSnap.id, ...orderDocSnap.data() };
              }
            } catch (fetchErr) {
              console.warn('[Delivery PushManager] Could not verify order in Firestore immediately:', fetchErr);
            }
          }

          let parsedOrder: any = null;
          if (data.fullOrderJson) {
            try {
              parsedOrder = typeof data.fullOrderJson === 'string' ? JSON.parse(data.fullOrderJson) : data.fullOrderJson;
            } catch {}
          }

          // Use verified Firestore order if available; otherwise use payload with unverified flag
          const orderObj = authoritativeOrder || (parsedOrder ? { ...parsedOrder, _unverifiedNotificationPayload: true } : data);
          const effectiveId = orderObj?.id || orderObj?.orderId || orderId;
          if (effectiveId) {
            useDeliveryStore.getState().addOrUpdateActiveOrder({ ...orderObj, id: effectiveId });
            toast.success(`🛵 New delivery assigned #${orderObj.orderNumber || effectiveId.slice(-6).toUpperCase()}!`, {
              duration: 5000,
              id: `toast-${effectiveId}`
            });
          }
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Delivery PushManager] Push notification action performed:', action);
          SoundAlertEngine.stopAlarm();
          const data = (action.notification?.data || {}) as Record<string, any>;
          const orderId = data.orderId || data.order_id || data.id;
          if (orderId) {
            navigate(`/live-orders?orderId=${encodeURIComponent(orderId)}`);
          } else {
            navigate('/live-orders');
          }
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
            registeredTokenRef.current = currentToken;
            isRegisteredRef.current = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Delivery PushManager] Token registration warning:', err.message);
    }
  }, [user, createChannels, navigate]);

  // Deregister token on logout
  useEffect(() => {
    if (!user && isRegisteredRef.current) {
      const token = registeredTokenRef.current;
      if (token) {
        fetchApi('/api/notifications/token/deregister', {
          method: 'POST',
          body: JSON.stringify({ token })
        }).catch(() => {});
      }
      registeredTokenRef.current = null;
      isRegisteredRef.current = false;
    }
  }, [user]);

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

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        snapshot.docs.forEach((doc) => {
          const order = doc.data() as any;
          NotificationDeduplicator.record(`delivery_assign:${doc.id}:${order?.version || 1}`);
        });
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const order = { id: change.doc.id, ...change.doc.data() } as any;

          // ── SYNTHETIC / TEST ORDER SAFEGUARD ──────────────────────────────────
          const isSynthetic = 
            order.id.startsWith('test_') ||
            order.id.startsWith('mock_') ||
            order.id.startsWith('synthetic_') ||
            order.id.startsWith('dummy_') ||
            order.id.startsWith('online_test_') ||
            order.id.startsWith('ord_test_') ||
            (order.customerName && /^(test|mock|synthetic|dummy|fake|archival test|idempotency test)/i.test(order.customerName)) ||
            (order.orderNumber && /test/i.test(String(order.orderNumber))) ||
            order.isTest === true;

          if (isSynthetic) return;

          // If status is partner_assigned and not yet accepted
          if (order.status === 'partner_assigned' && !order.acceptedAt) {
            const eventId = `delivery_assign:${order.id}:${order.version || 1}`;
            if (NotificationDeduplicator.shouldProcess(eventId)) {
              SoundAlertEngine.startContinuousAlarm();
              useDeliveryStore.getState().addOrUpdateActiveOrder(order);
              toast.success(`🛵 New delivery assigned #${order.orderNumber || order.id.slice(-6).toUpperCase()}!`, {
                duration: 5000,
                id: `toast-${order.id}`
              });
            }
          }
        }
      });
    }, (err) => {
      console.warn('[Delivery PushManager] Realtime listener error:', err);
    });

    return () => unsubscribe();
  }, [user, isAuthorized, isOnline]);

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
    </>
  );
}
