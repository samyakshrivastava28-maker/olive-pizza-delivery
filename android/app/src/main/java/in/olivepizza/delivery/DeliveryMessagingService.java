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
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

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
            String shiftType = data.get("type");
            if ("WORK_SHIFT_STARTED".equalsIgnoreCase(shiftType) || "WORK_SHIFT_ENDED".equalsIgnoreCase(shiftType)) {
                handleWorkShiftNotification(data, "WORK_SHIFT_STARTED".equalsIgnoreCase(shiftType));
                return;
            }
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
                FirebaseUser signedInRider = FirebaseAuth.getInstance().getCurrentUser();
                String recipientUid = data.get("recipientUid");
                if (signedInRider == null || recipientUid == null || !signedInRider.getUid().equals(recipientUid)) {
                    Log.w(TAG, "Ignoring delivery alert because the current authenticated rider does not match the target UID.");
                    return;
                }
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


    private void handleWorkShiftNotification(Map<String, String> data, boolean started) {
        String targetUid = data.get("riderUid");
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        // Never show operational schedule actions on a device signed in as a different account.
        if (user == null || targetUid == null || !targetUid.equals(user.getUid())) {
            Log.w(TAG, "Ignoring shift notification because the authenticated rider does not match.");
            return;
        }

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        createNotificationChannels(nm);

        String title = data.getOrDefault("title", started ? "Your work time has started" : "Your work time ended for today");
        String body = data.getOrDefault("body", started
                ? "You are scheduled and now marked online."
                : "You are offline. Continue work or finish for today.");
        String sound = data.getOrDefault("sound", started ? "new_order" : "order_delivered");
        String channel = data.getOrDefault("channelId", started
                ? "olive_shift_started_new_order" : "olive_shift_ended_order_delivered");
        int notificationId = ("olive-shift:" + targetUid + ":" + data.getOrDefault("eventId", started ? "start" : "end")).hashCode();
        int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        contentIntent.putExtra("openWorkSchedule", true);
        contentIntent.putExtra("continueWork", !started);
        contentIntent.putExtra("riderUid", targetUid);
        PendingIntent contentPi = PendingIntent.getActivity(this, notificationId, contentIntent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channel)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(contentPi)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(started)
                .setOngoing(!started)
                .setOnlyAlertOnce(true);

        if (!started) {
            Intent continueIntent = new Intent(this, ShiftNotificationActionReceiver.class);
            continueIntent.setAction("in.olivepizza.delivery.CONTINUE_SHIFT");
            continueIntent.putExtra("riderUid", targetUid);
            continueIntent.putExtra("notificationId", notificationId);
            PendingIntent continuePi = PendingIntent.getBroadcast(this, notificationId + 1, continueIntent, pendingFlags);

            Intent doneIntent = new Intent(this, ShiftNotificationActionReceiver.class);
            doneIntent.setAction("in.olivepizza.delivery.DONE_SHIFT");
            doneIntent.putExtra("riderUid", targetUid);
            doneIntent.putExtra("notificationId", notificationId);
            PendingIntent donePi = PendingIntent.getBroadcast(this, notificationId + 2, doneIntent, pendingFlags);

            builder.addAction(android.R.drawable.ic_media_play, "CONTINUE 1 HOUR", continuePi);
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "DONE", donePi);
        }
        nm.notify(notificationId, builder.build());

        if (started) {
            Intent tracking = new Intent(this, RiderBackgroundTrackingService.class);
            tracking.setAction(RiderBackgroundTrackingService.ACTION_START);
            tracking.putExtra(RiderBackgroundTrackingService.EXTRA_UID, targetUid);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(tracking);
                else startService(tracking);
            } catch (Exception e) {
                Log.w(TAG, "Shift-start push was shown, but Android did not allow the location service to start from background.", e);
            }
        } else {
            Intent stop = new Intent(this, RiderBackgroundTrackingService.class);
            stop.setAction(RiderBackgroundTrackingService.ACTION_STOP);
            try { stopService(stop); } catch (Exception e) {
                Log.w(TAG, "Could not stop tracking at the scheduled shift end.", e);
            }
        }
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

            createShiftChannel(nm, "olive_shift_started_new_order", "Work time started — new order chime", "new_order");
            createShiftChannel(nm, "olive_shift_started_order_alert", "Work time started — alert", "order_alert");
            createShiftChannel(nm, "olive_shift_ended_order_delivered", "Work time ended — completion chime", "order_delivered");
            createShiftChannel(nm, "olive_shift_ended_order_confirmed", "Work time ended — confirmation", "order_confirmed");
        }
    }

    private void createShiftChannel(NotificationManager manager, String id, String name, String rawSoundName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager.getNotificationChannel(id) != null) return;
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        int rawId = getResources().getIdentifier(rawSoundName, "raw", getPackageName());
        if (rawId != 0) {
            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + rawId);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .build();
            channel.setSound(soundUri, attrs);
        }
        manager.createNotificationChannel(channel);
    }
}
