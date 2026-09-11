package in.olivepizza.delivery;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * DeliveryMessagingService — Native FCM Handler for Olive Pizza Delivery Rider App
 *
 * Handles continuous order alarms, action buttons, and foreground wake-locks.
 */
public class DeliveryMessagingService extends FirebaseMessagingService {
    private static final String TAG = "DeliveryMessagingService";
    private static final String CHANNEL_ID_ALERT = "olive_delivery_alarm_channel_v2";
    private static final String CHANNEL_ID_ACTIONS = "olive_delivery_actions_v2";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.d(TAG, "Delivery FCM message received from: " + remoteMessage.getFrom());

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OliveDelivery::NotificationWakeLock");
            wakeLock.acquire(15000);
        }

        try {
            Map<String, String> data = new HashMap<>(remoteMessage.getData());
            RemoteMessage.Notification notif = remoteMessage.getNotification();
            if (notif != null) {
                if (!data.containsKey("title") && notif.getTitle() != null) data.put("title", notif.getTitle());
                if (!data.containsKey("body") && notif.getBody() != null) data.put("body", notif.getBody());
            }

            String stage = data.get("stage");
            String action = data.get("action");
            boolean isAssignment = "delivery_assigned".equalsIgnoreCase(stage) ||
                                  "partner_assigned".equalsIgnoreCase(stage) ||
                                  "alarm_actionable".equalsIgnoreCase(data.get("category"));

            if ("stop_alert".equalsIgnoreCase(action)) {
                String orderId = data.get("orderId");
                if (orderId != null) {
                    UrgentDeliveryAlertService.stopAlert(this, orderId);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(orderId.hashCode());
                }
            } else if (isAssignment) {
                wakeScreen(powerManager);
                String orderId = data.get("orderId");
                String orderNumber = data.get("orderNumber");
                if (orderNumber == null && orderId != null) {
                    orderNumber = orderId.substring(Math.max(0, orderId.length() - 6));
                }
                String customerName = data.get("customerName");
                String deliveryAddress = data.get("deliveryAddress");

                // Start continuous foreground looping alarm service (single order instance)
                UrgentDeliveryAlertService.startAlert(this, orderId, orderNumber, customerName, deliveryAddress);
            } else {
                showStandardDeliveryNotification(data);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling delivery FCM message: " + e.getMessage(), e);
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }

    private void wakeScreen(PowerManager pm) {
        try {
            if (pm != null && !pm.isInteractive()) {
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "OliveDelivery::ScreenWake"
                );
                screenLock.acquire(5000);
                screenLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "Screen wake exception: " + e.getMessage());
        }
    }

    private void showDeliveryAssignmentNotification(Map<String, String> data) {
        String orderId = data.get("orderId");
        String orderNumber = data.get("orderNumber");
        if (orderNumber == null && orderId != null) {
            orderNumber = orderId.substring(Math.max(0, orderId.length() - 6));
        }

        int notificationId = orderId != null ? orderId.hashCode() : (int) System.currentTimeMillis();
        String title = data.containsKey("title") ? data.get("title") : "New Delivery Assignment #" + (orderNumber != null ? orderNumber : "");
        String body = data.containsKey("body") ? data.get("body") : "Pickup at Olive Pizza Central Hub";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        createNotificationChannels(nm);

        int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;

        // Full Screen Alert Activity
        Intent fullScreenIntent = new Intent(this, UrgentDeliveryAlertActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            fullScreenIntent.putExtra(entry.getKey(), entry.getValue());
        }
        PendingIntent fullScreenPi = PendingIntent.getActivity(this, notificationId + 100, fullScreenIntent, pendingFlags);

        // Content Tap
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        contentIntent.putExtra("orderId", orderId);
        PendingIntent contentPi = PendingIntent.getActivity(this, notificationId, contentIntent, pendingFlags);

        // Action: Accept Delivery
        Intent acceptIntent = new Intent(this, NotificationActionReceiver.class);
        acceptIntent.setAction("in.olivepizza.delivery.ACTION_ACCEPT_DELIVERY");
        acceptIntent.putExtra("action", "accept_delivery");
        acceptIntent.putExtra("orderId", orderId);
        acceptIntent.putExtra("notificationId", notificationId);
        acceptIntent.putExtra("orderNumber", orderNumber);
        acceptIntent.putExtra("customerName", data.get("customerName"));
        acceptIntent.putExtra("deliveryAddress", data.get("deliveryAddress"));
        PendingIntent acceptPi = PendingIntent.getBroadcast(this, notificationId + 1, acceptIntent, pendingFlags);

        // Action: Decline Delivery
        Intent declineIntent = new Intent(this, NotificationActionReceiver.class);
        declineIntent.setAction("in.olivepizza.delivery.ACTION_DECLINE_DELIVERY");
        declineIntent.putExtra("action", "decline_delivery");
        declineIntent.putExtra("orderId", orderId);
        declineIntent.putExtra("notificationId", notificationId);
        PendingIntent declinePi = PendingIntent.getBroadcast(this, notificationId + 2, declineIntent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID_ALERT)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(contentPi)
            .setFullScreenIntent(fullScreenPi, true)
            .setOngoing(true)
            .setAutoCancel(false)
            .addAction(android.R.drawable.ic_menu_send, "ACCEPT", acceptPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "DECLINE", declinePi);

        nm.notify(notificationId, builder.build());
    }

    private void showStandardDeliveryNotification(Map<String, String> data) {
        String orderId = data.get("orderId");
        int notificationId = orderId != null ? orderId.hashCode() : (int) System.currentTimeMillis();
        String title = data.getOrDefault("title", "Olive Pizza Delivery");
        String body = data.getOrDefault("body", "Order update received.");

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        createNotificationChannels(nm);

        int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        contentIntent.putExtra("orderId", orderId);
        PendingIntent contentPi = PendingIntent.getActivity(this, notificationId, contentIntent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID_ACTIONS)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentPi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        nm.notify(notificationId, builder.build());
    }

    private void createNotificationChannels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Alarm Channel
            NotificationChannel alertChannel = new NotificationChannel(
                CHANNEL_ID_ALERT,
                "Delivery Alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("Urgent delivery assignment alerts with sound");
            alertChannel.enableVibration(true);
            alertChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(alertChannel);

            // Actions Channel
            NotificationChannel actionsChannel = new NotificationChannel(
                CHANNEL_ID_ACTIONS,
                "Delivery Actions",
                NotificationManager.IMPORTANCE_HIGH
            );
            actionsChannel.setDescription("Actionable notifications for active orders");
            actionsChannel.enableVibration(true);
            nm.createNotificationChannel(actionsChannel);
        }
    }
}
