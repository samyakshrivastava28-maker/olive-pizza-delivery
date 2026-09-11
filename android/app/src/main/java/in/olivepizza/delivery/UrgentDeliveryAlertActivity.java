package in.olivepizza.delivery;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * UrgentDeliveryAlertActivity — Production Full-Screen Native Delivery Alert
 *
 * Appears over lock screen, turns screen on, loops audio via USAGE_ALARM stream,
 * and renders Order #, Distance, ETA, Addresses, and Accept / Decline / View buttons.
 */
public class UrgentDeliveryAlertActivity extends AppCompatActivity {
    private static final String TAG = "UrgentDeliveryAlert";

    private String getBackendActionUrl() {
        try {
            int resId = getResources().getIdentifier("backend_base_url", "string", getPackageName());
            if (resId != 0) {
                String val = getString(resId);
                if (val != null && !val.isEmpty()) return val + "/api/notifications/action";
            }
        } catch (Exception ignored) {}
        return "https://olivepizza-owner.onrender.com/api/notifications/action";
    }

    private String orderId;
    private String orderNumber;
    private String distance;
    private String eta;
    private String pickupLocation;
    private String deliveryAddress;
    private String totalAmount;
    private String paymentMethod;
    private int notificationId;
    private MediaPlayer mediaPlayer;
    private Ringtone fallbackRingtone;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Turn screen on and show over lock screen
        setupWindowFlags();

        setContentView(R.layout.activity_urgent_delivery_alert);

        // Parse intent extras
        Intent intent = getIntent();
        orderId = intent.getStringExtra("orderId");
        orderNumber = intent.getStringExtra("orderNumber");
        distance = intent.getStringExtra("distance");
        eta = intent.getStringExtra("eta");
        pickupLocation = intent.getStringExtra("pickupLocation");
        deliveryAddress = intent.getStringExtra("deliveryAddress");
        totalAmount = intent.getStringExtra("totalAmount");
        paymentMethod = intent.getStringExtra("paymentMethod");
        notificationId = intent.getIntExtra("notificationId", -1);

        if (orderNumber == null || orderNumber.isEmpty()) {
            orderNumber = orderId != null ? "#" + orderId.substring(Math.max(0, orderId.length() - 6)).toUpperCase() : "#NEW";
        }

        // Bind Views
        TextView tvOrderNumber = findViewById(R.id.alert_order_number);
        TextView tvDistanceEta = findViewById(R.id.alert_distance_eta);
        TextView tvPayout = findViewById(R.id.alert_payout_amount);
        TextView tvPickup = findViewById(R.id.alert_pickup_location);
        TextView tvDelivery = findViewById(R.id.alert_delivery_address);
        TextView tvPayment = findViewById(R.id.alert_payment_method);

        Button btnAccept = findViewById(R.id.btn_accept_delivery);
        Button btnDecline = findViewById(R.id.btn_decline_delivery);
        Button btnView = findViewById(R.id.btn_view_delivery);

        tvOrderNumber.setText("Order " + orderNumber);
        
        String distEtaText = "📍 Delivery Assignment";
        if (distance != null && !distance.isEmpty() && eta != null && !eta.isEmpty()) {
            distEtaText = "📍 " + distance + " • " + eta + " ETA";
        } else if (distance != null && !distance.isEmpty()) {
            distEtaText = "📍 Distance: " + distance;
        } else if (eta != null && !eta.isEmpty()) {
            distEtaText = "⏱️ ETA: " + eta;
        }
        tvDistanceEta.setText(distEtaText);

        tvPayout.setText("₹" + (totalAmount != null ? totalAmount : "0") + " Order Value");
        if (pickupLocation != null && !pickupLocation.isEmpty()) {
            tvPickup.setText(pickupLocation);
        }
        if (deliveryAddress != null && !deliveryAddress.isEmpty()) {
            tvDelivery.setText(deliveryAddress);
        }
        tvPayment.setText("PAYMENT: " + (paymentMethod != null ? paymentMethod.toUpperCase() : "COD"));

        // Play continuous alert chime on USAGE_ALARM stream
        startAlarmAudio();

        // Button Click Handlers
        btnAccept.setOnClickListener(v -> handleAcceptDelivery(btnAccept));
        btnDecline.setOnClickListener(v -> handleDeclineDelivery());
        btnView.setOnClickListener(v -> handleViewDelivery());
    }

    private void setupWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void startAlarmAudio() {
        try {
            int resId = getResources().getIdentifier("delivery_chime", "raw", getPackageName());
            if (resId != 0) {
                mediaPlayer = MediaPlayer.create(this, resId);
                if (mediaPlayer != null) {
                    mediaPlayer.setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .build()
                    );
                    mediaPlayer.setLooping(true);
                    mediaPlayer.start();
                    return;
                }
            }
            
            // Fallback to in-built device alarm ringtone on USAGE_ALARM stream
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            if (alarmUri != null) {
                fallbackRingtone = RingtoneManager.getRingtone(this, alarmUri);
                if (fallbackRingtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        fallbackRingtone.setAudioAttributes(
                            new AudioAttributes.Builder()
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .build()
                        );
                    }
                    fallbackRingtone.play();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Audio play notice: " + e.getMessage());
        }
    }

    private void stopAlarmAudio() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (fallbackRingtone != null) {
            try {
                if (fallbackRingtone.isPlaying()) {
                    fallbackRingtone.stop();
                }
            } catch (Exception ignored) {}
            fallbackRingtone = null;
        }

        // Stop background alarm service
        UrgentDeliveryAlertService.stopAlert(this, orderId);

        // Cancel notification shade item
        if (notificationId != -1) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notificationId);
        }
    }

    private void handleAcceptDelivery(Button btnAccept) {
        stopAlarmAudio();
        btnAccept.setEnabled(false);
        btnAccept.setText("ACCEPTING...");

        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            Toast.makeText(this, "Opening app to authenticate...", Toast.LENGTH_SHORT).show();
            launchMainActivity(true, "accept");
            finish();
            return;
        }

        user.getIdToken(false).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                String token = task.getResult().getToken();
                executeBackendAction("ACCEPT", token);
            } else {
                launchMainActivity(true, "accept");
                finish();
            }
        });
    }

    private void executeBackendAction(String action, String token) {
        new Thread(() -> {
            try {
                URL url = new URL(getBackendActionUrl());
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setDoOutput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                JSONObject body = new JSONObject();
                body.put("action", action);
                body.put("orderId", orderId);
                body.put("role", "delivery");

                OutputStream os = conn.getOutputStream();
                os.write(body.toString().getBytes("UTF-8"));
                os.close();

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "Backend action " + action + " response: " + responseCode);

                new Handler(Looper.getMainLooper()).post(() -> {
                    if (responseCode >= 200 && responseCode < 300) {
                        Toast.makeText(this, "Delivery Accepted! 🛵", Toast.LENGTH_LONG).show();
                    }
                    launchMainActivity(true, action.toLowerCase());
                    finish();
                });
            } catch (Exception e) {
                Log.e(TAG, "Error executing backend action:", e);
                new Handler(Looper.getMainLooper()).post(() -> {
                    launchMainActivity(true, action.toLowerCase());
                    finish();
                });
            }
        }).start();
    }

    private void handleDeclineDelivery() {
        stopAlarmAudio();
        Toast.makeText(this, "Delivery declined", Toast.LENGTH_SHORT).show();
        finish();
    }

    private void handleViewDelivery() {
        stopAlarmAudio();
        launchMainActivity(false, null);
        finish();
    }

    private void launchMainActivity(boolean autoAction, String actionType) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (orderId != null) {
            intent.putExtra("orderId", orderId);
            intent.putExtra("url", "/live-orders?orderId=" + orderId);
        }
        if (autoAction && actionType != null) {
            intent.putExtra("autoAction", actionType);
        }
        startActivity(intent);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopAlarmAudio();
    }
}
