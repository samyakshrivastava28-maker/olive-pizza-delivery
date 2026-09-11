package in.olivepizza.delivery;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.util.concurrent.ConcurrentHashMap;

/**
 * UrgentDeliveryAlertService — Production continuous looping alarm service for delivery assignments.
 *
 * Runs as a foreground service with continuous USAGE_ALARM audio until rider interacts
 * (Accept, Decline, Open, or Cancel). Uses order-specific alert tracking to prevent duplicate loops.
 */
public class UrgentDeliveryAlertService extends Service {
    private static final String TAG = "UrgentDeliveryAlertSvc";
    public static final String CHANNEL_ID = "olive_delivery_alarm_channel_v2";
    public static final String ACTION_START_ALERT = "in.olivepizza.delivery.START_ALERT";
    public static final String ACTION_STOP_ALERT = "in.olivepizza.delivery.STOP_ALERT";

    public static final String EXTRA_ORDER_ID = "orderId";
    public static final String EXTRA_ORDER_NUMBER = "orderNumber";
    public static final String EXTRA_CUSTOMER_NAME = "customerName";
    public static final String EXTRA_DELIVERY_ADDRESS = "deliveryAddress";

    private static final ConcurrentHashMap<String, Boolean> activeAlertOrders = new ConcurrentHashMap<>();
    private static volatile UrgentDeliveryAlertService instance = null;

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private String currentOrderId;

    public static void startAlert(Context context, String orderId, String orderNumber, String customerName, String deliveryAddress) {
        if (orderId == null || orderId.isEmpty()) return;
        if (activeAlertOrders.containsKey(orderId)) {
            Log.d(TAG, "Alert already looping for order: " + orderId + ", skipping duplicate start.");
            return;
        }
        activeAlertOrders.put(orderId, true);

        Intent intent = new Intent(context, UrgentDeliveryAlertService.class);
        intent.setAction(ACTION_START_ALERT);
        intent.putExtra(EXTRA_ORDER_ID, orderId);
        intent.putExtra(EXTRA_ORDER_NUMBER, orderNumber);
        intent.putExtra(EXTRA_CUSTOMER_NAME, customerName);
        intent.putExtra(EXTRA_DELIVERY_ADDRESS, deliveryAddress);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stopAlert(Context context, String orderId) {
        if (orderId != null) {
            activeAlertOrders.remove(orderId);
        } else {
            activeAlertOrders.clear();
        }

        if (instance != null) {
            instance.stopSelfAndCleanup();
        } else if (context != null) {
            Intent intent = new Intent(context, UrgentDeliveryAlertService.class);
            intent.setAction(ACTION_STOP_ALERT);
            context.startService(intent);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP_ALERT.equals(action)) {
            stopSelfAndCleanup();
            return START_NOT_STICKY;
        }

        if (ACTION_START_ALERT.equals(action)) {
            currentOrderId = intent.getStringExtra(EXTRA_ORDER_ID);
            String orderNumber = intent.getStringExtra(EXTRA_ORDER_NUMBER);
            String customerName = intent.getStringExtra(EXTRA_CUSTOMER_NAME);
            String deliveryAddress = intent.getStringExtra(EXTRA_DELIVERY_ADDRESS);

            startUrgentAlarm(currentOrderId, orderNumber, customerName, deliveryAddress);
        }

        return START_NOT_STICKY;
    }

    private void startUrgentAlarm(String orderId, String orderNumber, String customerName, String deliveryAddress) {
        acquireWakeLock();
        createNotificationChannel();

        int notificationId = orderId != null ? orderId.hashCode() : 9999;
        int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        // Content tap intent
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        contentIntent.putExtra("orderId", orderId);
        PendingIntent contentPi = PendingIntent.getActivity(this, notificationId, contentIntent, pendingFlags);

        // Fullscreen intent
        Intent fullScreenIntent = new Intent(this, UrgentDeliveryAlertActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("orderId", orderId);
        fullScreenIntent.putExtra("orderNumber", orderNumber);
        fullScreenIntent.putExtra("customerName", customerName);
        fullScreenIntent.putExtra("deliveryAddress", deliveryAddress);
        PendingIntent fullScreenPi = PendingIntent.getActivity(this, notificationId + 100, fullScreenIntent, pendingFlags);

        // Action: Accept Delivery
        Intent acceptIntent = new Intent(this, NotificationActionReceiver.class);
        acceptIntent.setAction("in.olivepizza.delivery.ACTION_ACCEPT_DELIVERY");
        acceptIntent.putExtra("action", "accept_delivery");
        acceptIntent.putExtra("orderId", orderId);
        acceptIntent.putExtra("notificationId", notificationId);
        acceptIntent.putExtra("orderNumber", orderNumber);
        acceptIntent.putExtra("customerName", customerName);
        acceptIntent.putExtra("deliveryAddress", deliveryAddress);
        PendingIntent acceptPi = PendingIntent.getBroadcast(this, notificationId + 1, acceptIntent, pendingFlags);

        // Action: Decline Delivery
        Intent declineIntent = new Intent(this, NotificationActionReceiver.class);
        declineIntent.setAction("in.olivepizza.delivery.ACTION_DECLINE_DELIVERY");
        declineIntent.putExtra("action", "decline_delivery");
        declineIntent.putExtra("orderId", orderId);
        declineIntent.putExtra("notificationId", notificationId);
        PendingIntent declinePi = PendingIntent.getBroadcast(this, notificationId + 2, declineIntent, pendingFlags);

        String title = "NEW DELIVERY ASSIGNMENT #" + (orderNumber != null ? orderNumber : "");
        String body = (deliveryAddress != null && !deliveryAddress.isEmpty())
            ? "Deliver to: " + deliveryAddress
            : "Pickup at Olive Pizza Central Hub";

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
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
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "DECLINE", declinePi)
            .build();

        startForeground(notificationId, notification);
        startLoopingAudio();
    }

    private void startLoopingAudio() {
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
                mediaPlayer = null;
            }

            Uri alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alertUri == null) {
                alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alertUri);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            Log.w(TAG, "Failed to start looping MediaPlayer: " + e.getMessage());
        }

        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 1000, 500, 1000, 500};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to start vibration: " + e.getMessage());
        }
    }

    private void stopSelfAndCleanup() {
        try {
            if (mediaPlayer != null) {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception ignored) {}

        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Exception ignored) {}

        releaseWakeLock();
        stopForeground(true);
        instance = null;
        stopSelf();
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OliveDelivery::UrgentAlertWakeLock");
                wakeLock.acquire(60000); // Max 60 seconds
            }
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }
        } catch (Exception ignored) {}
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Delivery Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Urgent delivery assignment alerts with sound");
                channel.enableVibration(true);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        stopSelfAndCleanup();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
