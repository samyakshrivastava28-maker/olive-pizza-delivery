package in.olivepizza.delivery;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * DeliveryMessagingService — Handles urgent delivery assignments
 * Scoped strictly to the assigned delivery partner.
 */
public class DeliveryMessagingService extends MessagingService {
    private static final String TAG = "DeliveryMessaging";

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
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(orderId.hashCode());
                }
            } else if (isAssignment) {
                wakeScreen(powerManager);
                showDeliveryAssignmentNotification(data);
            } else {
                showStandardDeliveryNotification(data);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling delivery FCM message:", e);
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }

    private void wakeScreen(PowerManager powerManager) {
        if (powerManager == null) return;
        try {
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock screenLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                "OliveDelivery::EmergencyScreenWakeLock"
            );
            screenLock.acquire(10000);
            Log.d(TAG, "⚡ Screen woke up for delivery assignment!");
        } catch (Exception e) {
            Log.w(TAG, "Could not acquire screen wake lock: " + e.getMessage());
        }
    }

    private void showDeliveryAssignmentNotification(Map<String, String> data) {
        String orderId = data.get("orderId");
        String orderNumber = data.get("orderNumber");
        String title = data.get("title");
        String body = data.get("body");
        String distance = data.get("distance");
        String eta = data.get("eta");

        if (title == null) title = "📦 New Delivery Assignment" + (distance != null ? " • " + distance : "");
        if (body == null) body = "Order " + (orderNumber != null ? orderNumber : "") + (eta != null ? " • ETA: " + eta : "");

        int notifId = orderId != null ? orderId.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        String channelId = "olive_delivery_assignment";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannelExists(nm, channelId, "Olive Delivery Assignments", true, "delivery_chime");

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (orderId != null) {
            contentIntent.putExtra("orderId", orderId);
            contentIntent.putExtra("url", "/live-orders?orderId=" + orderId);
        }
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            this,
            notifId,
            contentIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Uri soundUri = resolveSoundUri("delivery_chime");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getSmallIconResId())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setColor(0xFFF59E0B)
            .setSound(soundUri)
            .addAction(0, "ACCEPT DELIVERY", contentPendingIntent);

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT;

        if (nm != null) {
            nm.notify(notifId, notification);
            Log.i(TAG, "📦 Delivery assignment notification posted: id=" + notifId);
        }
    }

    private void showStandardDeliveryNotification(Map<String, String> data) {
        String title = data.get("title") != null ? data.get("title") : "Olive Pizza Delivery";
        String body = data.get("body") != null ? data.get("body") : "Delivery update received.";
        String channelId = "olive_delivery_updates";

        int notifId = (int) (System.currentTimeMillis() & 0x7fffffff);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannelExists(nm, channelId, "Olive Delivery Updates", false, "default");

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            this,
            notifId,
            contentIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getSmallIconResId())
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);

        if (nm != null) nm.notify(notifId, builder.build());
    }

    private void ensureChannelExists(NotificationManager nm, String channelId, String name, boolean isAlarm, String soundName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || nm == null) return;
        if (nm.getNotificationChannel(channelId) != null) return;

        int importance = isAlarm ? NotificationManager.IMPORTANCE_MAX : NotificationManager.IMPORTANCE_HIGH;
        NotificationChannel channel = new NotificationChannel(channelId, name, importance);
        channel.enableVibration(true);
        channel.setShowBadge(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        Uri soundUri = resolveSoundUri(soundName);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(isAlarm ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION)
            .build();
        channel.setSound(soundUri, audioAttributes);

        if (isAlarm && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                channel.setBypassDnd(true);
            } catch (Exception ignored) {}
        }

        nm.createNotificationChannel(channel);
    }

    private Uri resolveSoundUri(String soundName) {
        if (soundName != null && !soundName.isEmpty() && !"default".equals(soundName)) {
            String cleanName = soundName.contains(".") ? soundName.split("\\.")[0] : soundName;
            int resId = getResources().getIdentifier(cleanName, "raw", getPackageName());
            if (resId != 0) {
                return Uri.parse("android.resource://" + getPackageName() + "/" + resId);
            }
        }
        return android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
    }

    private int getSmallIconResId() {
        int resId = getResources().getIdentifier("ic_stat_icon_config_sample", "drawable", getPackageName());
        if (resId == 0) resId = getApplicationInfo().icon;
        if (resId == 0) resId = android.R.drawable.ic_dialog_info;
        return resId;
    }
}
