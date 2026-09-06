package in.olivepizza.delivery;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;

/**
 * Olive Pizza Delivery — Native Notification Action Receiver
 *
 * Handles rider one-tap actions directly from the active order notification:
 *  - Navigate to Store / Customer (Google Maps Intent)
 *  - Arrived at Store
 *  - Picked Up
 *  - Arrived at Customer
 *  - Complete Delivery (launches in-app proof of delivery)
 */
public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "DeliveryActionReceiver";
    private static final String BACKEND_BASE_URL = "https://olivepizza-owner.onrender.com";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String orderId = intent.getStringExtra("orderId");
        int notificationId = intent.getIntExtra("notificationId", -1);

        if (action == null) return;
        Log.d(TAG, "Delivery action received: " + action + " for order: " + orderId);

        // ── Navigation Action (Google Maps) ──────────────────────────────────
        if ("action_navigate".equals(action)) {
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
                // Fallback to generic map handler
                Intent fallbackMap = new Intent(Intent.ACTION_VIEW, gmmIntentUri);
                fallbackMap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallbackMap);
            }
            return;
        }

        // ── UI-Requiring Action: Complete Delivery (Proof / Signature required)
        if ("action_complete".equals(action)) {
            Intent appIntent = new Intent(context, MainActivity.class);
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            appIntent.putExtra("orderId", orderId);
            appIntent.putExtra("openAction", "complete_delivery");
            context.startActivity(appIntent);
            return;
        }

        if (orderId == null) {
            Log.w(TAG, "No orderId provided for status action");
            return;
        }

        // ── Background Authenticated Status Actions ─────────────────────────
        final PendingResult pendingResult = goAsync();
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();

        if (user == null) {
            showToast(context, "Please open Olive Delivery app to authenticate.");
            pendingResult.finish();
            return;
        }

        user.getIdToken(true).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                String token = task.getResult().getToken();
                String backendAction = mapActionToBackend(action);
                performBackendAction(context, backendAction, orderId, notificationId, token, pendingResult);
            } else {
                Log.e(TAG, "Failed to get Firebase token", task.getException());
                showToast(context, "Authentication failed. Please open the app.");
                pendingResult.finish();
            }
        });
    }

    private String mapActionToBackend(String action) {
        if ("action_arrived_at_store".equals(action)) return "ARRIVED_AT_STORE";
        if ("action_pickup".equals(action)) return "PICKED_UP";
        if ("action_arrived_at_customer".equals(action)) return "ARRIVED_AT_CUSTOMER";
        return action.toUpperCase();
    }

    private void performBackendAction(
            Context context,
            String action,
            String orderId,
            int notificationId,
            String idToken,
            PendingResult pendingResult
    ) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(BACKEND_BASE_URL + "/api/rider-delivery/orders/" + orderId + "/action");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + idToken);
                conn.setRequestProperty("Idempotency-Key", "notif_" + UUID.randomUUID().toString());
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);

                JSONObject body = new JSONObject();
                body.put("action", action);
                body.put("idempotencyKey", "notif_act_" + System.currentTimeMillis());

                OutputStream os = conn.getOutputStream();
                os.write(body.toString().getBytes("UTF-8"));
                os.close();

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "Backend action response code: " + responseCode);

                if (responseCode == 200) {
                    showToast(context, "Order status updated successfully!");
                } else if (responseCode == 403) {
                    showToast(context, "Unauthorized: Order assigned to another partner.");
                } else {
                    showToast(context, "Status update failed. Please open the app.");
                }
            } catch (Exception e) {
                Log.e(TAG, "Network error updating order status", e);
                showToast(context, "Network issue. Please update status inside the app.");
            } finally {
                if (conn != null) conn.disconnect();
                pendingResult.finish();
            }
        }).start();
    }

    private void showToast(Context context, String message) {
        new Handler(Looper.getMainLooper()).post(() ->
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        );
    }
}
