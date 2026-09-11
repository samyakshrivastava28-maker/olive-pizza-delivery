package in.olivepizza.delivery;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GetTokenResult;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * DeliveryActionWorker — Executes background order transitions for delivery riders.
 * Guarantees execution via WorkManager even when the app process is closed.
 * Updates the native Android notification in-place with the next action.
 */
public class DeliveryActionWorker extends Worker {
    private static final String TAG = "DeliveryActionWorker";

    private String getBackendBaseUrl() {
        try {
            int resId = getApplicationContext().getResources().getIdentifier("backend_base_url", "string", getApplicationContext().getPackageName());
            if (resId != 0) {
                String val = getApplicationContext().getString(resId);
                if (val != null && !val.isEmpty()) return val;
            }
        } catch (Exception ignored) {}
        return "https://olivepizza-owner.onrender.com";
    }

    public static final String KEY_ORDER_ID = "orderId";
    public static final String KEY_ACTION = "action";
    public static final String KEY_REQUEST_ID = "requestId";
    public static final String KEY_NOTIFICATION_ID = "notificationId";
    public static final String KEY_ORDER_NUMBER = "orderNumber";
    public static final String KEY_CUSTOMER_NAME = "customerName";
    public static final String KEY_DELIVERY_ADDRESS = "deliveryAddress";

    public DeliveryActionWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        String orderId = getInputData().getString(KEY_ORDER_ID);
        String action = getInputData().getString(KEY_ACTION);
        String requestId = getInputData().getString(KEY_REQUEST_ID);
        int notificationId = getInputData().getInt(KEY_NOTIFICATION_ID, orderId != null ? orderId.hashCode() : -1);
        String orderNumber = getInputData().getString(KEY_ORDER_NUMBER);
        String customerName = getInputData().getString(KEY_CUSTOMER_NAME);
        String deliveryAddress = getInputData().getString(KEY_DELIVERY_ADDRESS);

        if (orderId == null || action == null) {
            Log.e(TAG, "Missing orderId or action in worker data");
            return Result.failure();
        }

        Log.i(TAG, "Executing DeliveryActionWorker for order: " + orderId + ", action: " + action + ", attempt: " + getRunAttemptCount());

        try {
            // 1. Obtain Fresh Firebase Auth ID Token for Rider
            FirebaseAuth auth = FirebaseAuth.getInstance();
            FirebaseUser currentUser = auth.getCurrentUser();
            String idToken = null;

            if (currentUser != null) {
                try {
                    GetTokenResult tokenResult = Tasks.await(currentUser.getIdToken(true), 15, TimeUnit.SECONDS);
                    if (tokenResult != null) {
                        idToken = tokenResult.getToken();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Failed to get fresh Firebase token, will attempt request with cached token: " + e.getMessage());
                }
            }

            // 2. Perform Backend HTTP Request
            String endpoint = getBackendBaseUrl() + "/api/notifications/action";
            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            if (idToken != null) {
                conn.setRequestProperty("Authorization", "Bearer " + idToken);
            }
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);

            JSONObject payload = new JSONObject();
            payload.put("orderId", orderId);
            payload.put("action", action);
            payload.put("requestId", requestId);
            if (currentUser != null) {
                payload.put("riderId", currentUser.getUid());
                payload.put("riderPhone", currentUser.getPhoneNumber() != null ? currentUser.getPhoneNumber() : "");
            }

            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = payload.toString().getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }

            int responseCode = conn.getResponseCode();
            Log.d(TAG, "Backend responded with code: " + responseCode);

            InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
            StringBuilder sb = new StringBuilder();
            if (is != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                }
            }
            String responseBody = sb.toString();
            Log.d(TAG, "Backend response body: " + responseBody);

            if (responseCode >= 200 && responseCode < 300) {
                // Update notification in tray with next stage
                updateNotificationForNextStage(getApplicationContext(), notificationId, orderId, orderNumber, action, customerName, deliveryAddress);
                return Result.success();
            } else if (responseCode >= 400 && responseCode < 500) {
                // Client error (e.g. 409 already accepted or 400 invalid state) - don't retry endlessly
                Log.w(TAG, "Client error from backend: " + responseCode + " - " + responseBody);
                showFinalNotification(getApplicationContext(), notificationId, "Olive Pizza Delivery", "Order status updated.", false);
                return Result.failure();
            } else {
                // Server error (5xx) - retry with exponential backoff
                Log.e(TAG, "Server error " + responseCode + ", requesting retry");
                if (getRunAttemptCount() < 3) {
                    return Result.retry();
                } else {
                    return Result.failure();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception during delivery action execution: " + e.getMessage(), e);
            if (getRunAttemptCount() < 3) {
                return Result.retry();
            }
            return Result.failure();
        }
    }

    private void updateNotificationForNextStage(Context context, int notificationId, String orderId, String orderNumber, String completedAction, String customerName, String deliveryAddress) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            String channelId = "olive_delivery_actions_v2";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "Delivery Actions",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Actionable updates for delivery partners");
                channel.enableVibration(true);
                nm.createNotificationChannel(channel);
            }

            String displayOrderNum = (orderNumber != null && !orderNumber.isEmpty()) ? orderNumber : orderId.substring(Math.max(0, orderId.length() - 6));
            String title;
            String text;
            String nextActionLabel = null;
            String nextActionName = null;

            switch (completedAction) {
                case "accept_delivery":
                    title = "Order #" + displayOrderNum + " Accepted";
                    text = "Head to Olive Pizza. Tap 'Confirm Pickup' once food is collected.";
                    nextActionLabel = "Confirm Pickup";
                    nextActionName = "pickup_delivery";
                    break;
                case "pickup_delivery":
                    title = "Order #" + displayOrderNum + " Picked Up";
                    text = "En route to " + (customerName != null && !customerName.isEmpty() ? customerName : "customer") + ". Tap 'Out for Delivery'.";
                    nextActionLabel = "Out for Delivery";
                    nextActionName = "out_for_delivery";
                    break;
                case "out_for_delivery":
                    title = "Delivering Order #" + displayOrderNum;
                    text = "Arriving at " + (deliveryAddress != null && !deliveryAddress.isEmpty() ? deliveryAddress : "destination") + ". Tap 'Mark Delivered' upon drop-off.";
                    nextActionLabel = "Mark Delivered";
                    nextActionName = "complete_delivery";
                    break;
                case "complete_delivery":
                    title = "Order #" + displayOrderNum + " Completed";
                    text = "Delivery confirmed. Great job!";
                    showFinalNotification(context, notificationId, title, text, true);
                    return;
                case "decline_delivery":
                    nm.cancel(notificationId);
                    return;
                default:
                    title = "Order #" + displayOrderNum + " Updated";
                    text = "Status: " + completedAction;
                    break;
            }

            Intent tapIntent = new Intent(context, MainActivity.class);
            tapIntent.putExtra("orderId", orderId);
            tapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent contentIntent = PendingIntent.getActivity(context, notificationId, tapIntent, pendingFlags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setOngoing(nextActionName != null)
                .setAutoCancel(nextActionName == null)
                .setContentIntent(contentIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

            // Add Next Action Button
            if (nextActionName != null && nextActionLabel != null) {
                Intent actionIntent = new Intent(context, NotificationActionReceiver.class);
                actionIntent.setAction("in.olivepizza.delivery.ACTION_" + nextActionName.toUpperCase());
                actionIntent.putExtra("action", nextActionName);
                actionIntent.putExtra("orderId", orderId);
                actionIntent.putExtra("notificationId", notificationId);
                actionIntent.putExtra("orderNumber", displayOrderNum);
                actionIntent.putExtra("customerName", customerName);
                actionIntent.putExtra("deliveryAddress", deliveryAddress);

                PendingIntent actionPi = PendingIntent.getBroadcast(
                    context,
                    (notificationId + "_" + nextActionName).hashCode(),
                    actionIntent,
                    pendingFlags
                );

                builder.addAction(android.R.drawable.ic_media_play, nextActionLabel, actionPi);
            }

            nm.notify(notificationId, builder.build());
        } catch (Exception e) {
            Log.e(TAG, "Error updating notification for next stage: " + e.getMessage(), e);
        }
    }

    private void showFinalNotification(Context context, int notificationId, String title, String message, boolean autoDismiss) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, "olive_delivery_actions_v2")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(message)
                .setOngoing(false)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

            nm.notify(notificationId, builder.build());

            if (autoDismiss) {
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    try {
                        nm.cancel(notificationId);
                    } catch (Exception ignored) {}
                }, 8000);
            }
        } catch (Exception ignored) {}
    }
}
