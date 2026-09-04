package in.olivepizza.delivery;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

/**
 * Olive Pizza Delivery — Main Activity
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "OliveDeliveryMainActivity";

    public static final String CHANNEL_DELIVERY_ASSIGN  = "olive_delivery_assignment";
    public static final String CHANNEL_DELIVERY_UPDATES = "olive_delivery_updates";
    public static final String CHANNEL_SYSTEM           = "olive_system";

    private static volatile boolean batteryPromptShown = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        createNotificationChannels();
        super.onCreate(savedInstanceState);
    }

    public static boolean canUseFullScreenIntent(Context context) {
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.canUseFullScreenIntent();
        }
        return true;
    }

    public static boolean isIgnoringBatteryOptimizations(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        return true;
    }

    public static void requestFullScreenIntentPermission(Activity activity) {
        if (Build.VERSION.SDK_INT >= 34 && activity != null) {
            if (!canUseFullScreenIntent(activity)) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                    intent.setData(Uri.parse("package:" + activity.getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(intent);
                } catch (Exception e) {
                    Log.w(TAG, "Could not launch ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT: " + e.getMessage());
                }
            }
        }
    }

    public static void promptBatteryOptimizationExemption(Activity activity) {
        if (batteryPromptShown || activity == null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
        if (pm == null || pm.isIgnoringBatteryOptimizations(activity.getPackageName())) return;

        batteryPromptShown = true;
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + activity.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            Toast.makeText(activity, "Please allow Olive Pizza Delivery to run in background for assignment alarms", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Log.w(TAG, "Could not show battery optimization prompt: " + e.getMessage());
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Alarm Channel for delivery assignment
        createAlarmChannel(nm, CHANNEL_DELIVERY_ASSIGN, "Olive Delivery Assignments");
        // Standard notification channels
        createStandardChannel(nm, CHANNEL_DELIVERY_UPDATES, "Olive Delivery Updates");
        createStandardChannel(nm, CHANNEL_SYSTEM, "Olive System Alerts");

        Log.i(TAG, "Delivery notification channels initialized successfully.");
    }

    private void createAlarmChannel(NotificationManager nm, String id, String name) {
        if (nm.getNotificationChannel(id) != null) return;

        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setShowBadge(true);
        channel.setBypassDnd(true);

        Uri soundUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM);
        if (soundUri == null) {
            soundUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
        channel.setSound(soundUri, audioAttributes);

        nm.createNotificationChannel(channel);
    }

    private void createStandardChannel(NotificationManager nm, String id, String name) {
        if (nm.getNotificationChannel(id) != null) return;

        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setShowBadge(true);

        Uri soundUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        channel.setSound(soundUri, audioAttributes);

        nm.createNotificationChannel(channel);
    }
}

