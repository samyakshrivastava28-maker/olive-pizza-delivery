package in.olivepizza.delivery;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Olive Pizza Delivery — Native Notification Action Receiver
 *
 * Handles rider actions directly from the Android notification tray without opening the app UI.
 * Enqueues reliable background tasks via WorkManager for guaranteed execution.
 */
public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NotificationActionReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String rawAction = intent.getStringExtra("action");
        if (rawAction == null || rawAction.isEmpty()) {
            rawAction = intent.getAction();
        }

        String orderId = intent.getStringExtra("orderId");
        int notificationId = intent.getIntExtra("notificationId", orderId != null ? orderId.hashCode() : -1);
        String orderNumber = intent.getStringExtra("orderNumber");
        String customerName = intent.getStringExtra("customerName");
        String deliveryAddress = intent.getStringExtra("deliveryAddress");

        if (rawAction == null) return;
        Log.d(TAG, "Notification action received: " + rawAction + " for order: " + orderId);

        // Navigation Action (Google Maps)
        if ("action_navigate".equalsIgnoreCase(rawAction) || "NAVIGATE".equalsIgnoreCase(rawAction)) {
            String lat = intent.getStringExtra("destLat");
            String lng = intent.getStringExtra("destLng");
            String label = intent.getStringExtra("destLabel");
            if (label == null) label = "Delivery Destination";

            Uri gmmIntentUri = (lat != null && lng != null)
                ? Uri.parse("google.navigation:q=" + lat + "," + lng + "&mode=d")
                : Uri.parse("geo:0,0?q=Olive+Pizza+Rajnandgaon");

            Intent mapIntent = new Intent(Intent.ACTION_VIEW, gmmIntentUri);
            mapIntent.setPackage("com.google.android.apps.maps");
            mapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            try {
                context.startActivity(mapIntent);
            } catch (Exception e) {
                Intent fallbackMap = new Intent(Intent.ACTION_VIEW, gmmIntentUri);
                fallbackMap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallbackMap);
            }
            return;
        }

        if (orderId == null) {
            Log.w(TAG, "No orderId provided for notification action: " + rawAction);
            return;
        }

        String canonicalAction = normalizeAction(rawAction);

        // Immediately stop continuous alarm looping upon rider action interaction
        UrgentDeliveryAlertService.stopAlert(context, orderId);

        // Immediate Optimistic UI Feedback in Notification Shade
        showOptimisticFeedback(context, notificationId, canonicalAction, orderNumber);

        // Enqueue WorkManager task for reliable background API execution
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            String requestId = "req_" + UUID.randomUUID().toString();

            Data inputData = new Data.Builder()
                .putString(DeliveryActionWorker.KEY_ORDER_ID, orderId)
                .putString(DeliveryActionWorker.KEY_ACTION, canonicalAction)
                .putString(DeliveryActionWorker.KEY_REQUEST_ID, requestId)
                .putInt(DeliveryActionWorker.KEY_NOTIFICATION_ID, notificationId)
                .putString(DeliveryActionWorker.KEY_ORDER_NUMBER, orderNumber != null ? orderNumber : "")
                .putString(DeliveryActionWorker.KEY_CUSTOMER_NAME, customerName != null ? customerName : "")
                .putString(DeliveryActionWorker.KEY_DELIVERY_ADDRESS, deliveryAddress != null ? deliveryAddress : "")
                .build();

            OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(DeliveryActionWorker.class)
                .setConstraints(constraints)
                .setInputData(inputData)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .addTag("order_action_" + orderId)
                .build();

            WorkManager.getInstance(context)
                .enqueueUniqueWork("delivery_action_" + orderId, ExistingWorkPolicy.REPLACE, workRequest);

            Log.i(TAG, "Enqueued WorkManager DeliveryActionWorker for order: " + orderId + ", action: " + canonicalAction);
        } catch (Exception e) {
            Log.e(TAG, "Failed to enqueue DeliveryActionWorker: " + e.getMessage(), e);
        }
    }

    private String normalizeAction(String rawAction) {
        if (rawAction == null) return "unknown";
        String lower = rawAction.toLowerCase();
        if (lower.contains("accept")) return "accept_delivery";
        if (lower.contains("decline") || lower.contains("reject")) return "decline_delivery";
        if (lower.contains("pickup") || lower.contains("pick_up") || lower.contains("picked_up")) return "pickup_delivery";
        if (lower.contains("out_for_delivery") || lower.contains("on_the_way")) return "out_for_delivery";
        if (lower.contains("deliver") || lower.contains("complete")) return "complete_delivery";
        return rawAction;
    }

    private void showOptimisticFeedback(Context context, int notificationId, String action, String orderNumber) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            String statusText;
            switch (action) {
                case "accept_delivery":
                    statusText = "Accepting order #" + (orderNumber != null ? orderNumber : "") + "...";
                    break;
                case "decline_delivery":
                    statusText = "Declining order #" + (orderNumber != null ? orderNumber : "") + "...";
                    nm.cancel(notificationId);
                    return;
                case "pickup_delivery":
                    statusText = "Confirming pickup for #" + (orderNumber != null ? orderNumber : "") + "...";
                    break;
                case "out_for_delivery":
                    statusText = "Marking #" + (orderNumber != null ? orderNumber : "") + " out for delivery...";
                    break;
                case "complete_delivery":
                    statusText = "Completing delivery for #" + (orderNumber != null ? orderNumber : "") + "...";
                    break;
                default:
                    statusText = "Updating order...";
                    break;
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, "olive_delivery_actions_v2")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Olive Pizza Delivery")
                .setContentText(statusText)
                .setProgress(0, 0, true)
                .setOngoing(true)
                .setAutoCancel(false)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

            nm.notify(notificationId, builder.build());
        } catch (Exception e) {
            Log.w(TAG, "Could not show optimistic notification: " + e.getMessage());
        }
    }
}
