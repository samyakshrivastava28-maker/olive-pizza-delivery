/**
 * Olive Pizza Delivery — Firebase Cloud Messaging Service Worker
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAqkcY-WQrW3WoZWRrv8oo7MTAI_nVrLw4",
  authDomain: "olive-pizza-08.firebaseapp.com",
  projectId: "olive-pizza-08",
  storageBucket: "olive-pizza-08.firebasestorage.app",
  messagingSenderId: "1017239455106",
  appId: "1:1017239455106:web:c1c4d28c3a4bc3a3007b9b"
});

const messaging = firebase.messaging();

const API_BASE = 'https://olivepizza-owner.onrender.com/api';
const BROADCAST = new BroadcastChannel('olive_pizza_notifications');
const ICON = 'https://res.cloudinary.com/dxmlvkff1/image/upload/v1782376898/olive-pizza/brand/logo.png';
const BADGE = 'https://res.cloudinary.com/dxmlvkff1/image/upload/v1782376898/olive-pizza/brand/badge_mono.png';

self.addEventListener('error', (event) => {
  console.error('[SW Safe Mode] Error:', event.message);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW Safe Mode] Rejection:', event.reason);
});

messaging.onBackgroundMessage(async (payload) => {
  const data = payload.data || {};
  if (data.action === 'STOP_ALERT' || data.action === 'stop_alert') {
    BROADCAST.postMessage({ type: 'STOP_ALERT', orderId: data.orderId });
    return;
  }

  const tag = data.tag || `notification_${Date.now()}`;
  const notifTitle = payload.notification?.title || data.title || 'Olive Pizza Delivery';
  const notifBody = payload.notification?.body || data.body || 'New operational update received';
  const orderId = data.orderId;
  const stage = data.stage || 'update';

  const options = {
    body: notifBody,
    icon: ICON,
    badge: BADGE,
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 200, 300, 200, 300],
    data: {
      url: '/live-orders',
      orderId,
      stage,
      role: 'delivery'
    },
    timestamp: Date.now()
  };

  BROADCAST.postMessage({ type: 'START_ALERT', orderId, sound: data.sound || 'order_alert' });
  await self.registration.showNotification(notifTitle, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const action = event.action;

  if (action === 'stop_alert') {
    BROADCAST.postMessage({ type: 'STOP_ALERT', orderId: notifData.orderId });
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(notifData.url || '/live-orders');
      }
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
