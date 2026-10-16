package in.olivepizza.delivery;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.firebase.auth.GetTokenResult;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground location service. The rider explicitly starts it by going online
 * from the visible, authenticated app. Android displays an ongoing notification
 * while this service tracks location.
 */
public class RiderBackgroundTrackingService extends Service implements LocationListener {
    public static final String ACTION_START = "in.olivepizza.delivery.START_BACKGROUND_TRACKING";
    public static final String ACTION_STOP = "in.olivepizza.delivery.STOP_BACKGROUND_TRACKING";
    public static final String EXTRA_UID = "riderUid";
    private static final String TAG = "RiderBackgroundTracking";
    private static final String CHANNEL_ID = "olive_rider_background_location";
    private static final int NOTIFICATION_ID = 732041;
    private static final String STATUS_URL = "https://olivepizza-owner.onrender.com/api/delivery/rider/status";

    private String riderUid;
    private LocationManager locationManager;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile long lastSentAt = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            removeUpdates();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null && intent.getStringExtra(EXTRA_UID) != null) {
            riderUid = intent.getStringExtra(EXTRA_UID);
        }
        FirebaseUser currentUser = FirebaseAuth.getInstance().getCurrentUser();
        if (currentUser == null || riderUid == null || !riderUid.equals(currentUser.getUid())) {
            Log.w(TAG, "Refusing background tracking without the matching authenticated rider.");
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildOngoingNotification());
        requestUpdates();
        return START_STICKY;
    }

    private void requestUpdates() {
        if (locationManager == null) return;
        boolean hasFine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!hasFine && !hasCoarse) {
            Log.w(TAG, "Location permission is not granted; tracking service will stop.");
            stopSelf();
            return;
        }
        try {
            if (hasFine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000L, 0f, this, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000L, 0f, this, Looper.getMainLooper());
            }
            Location last = null;
            try { last = locationManager.getLastKnownLocation(hasFine ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}
            if (last != null) onLocationChanged(last);
        } catch (SecurityException e) {
            Log.w(TAG, "Location permission changed while starting service.", e);
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Unable to start location updates.", e);
            stopSelf();
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null || riderUid == null) return;
        long now = System.currentTimeMillis();
        if (now - lastSentAt < 4000) return;
        lastSentAt = now;
        final double lat = location.getLatitude();
        final double lng = location.getLongitude();
        final float accuracy = location.hasAccuracy() ? location.getAccuracy() : 0f;

        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null || !riderUid.equals(user.getUid())) {
            Log.w(TAG, "Authenticated rider changed; stopping location upload.");
            removeUpdates();
            stopSelf();
            return;
        }
        user.getIdToken(false).addOnSuccessListener(io, tokenResult -> {
            String token = tokenResult.getToken();
            if (token == null || token.isEmpty()) return;
            io.execute(() -> postLocation(token, lat, lng, accuracy));
        });
    }

    private void postLocation(String token, double lat, double lng, float accuracy) {
        HttpURLConnection connection = null;
        try {
            JSONObject body = new JSONObject();
            body.put("isOnline", true);
            body.put("lat", lat);
            body.put("lng", lng);
            body.put("latitude", lat);
            body.put("longitude", lng);
            body.put("accuracy", accuracy);
            body.put("backgroundService", true);
            connection = (HttpURLConnection) new URL(STATUS_URL).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("X-App-Target", "DELIVERY");
            connection.setRequestProperty("X-App-Source", "DELIVERY");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                Log.w(TAG, "Location upload returned HTTP " + status);
            }
        } catch (Exception e) {
            Log.w(TAG, "Background location upload failed; next GPS update will retry.", e);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private Notification buildOngoingNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pending = PendingIntent.getActivity(this, 732042, open, flags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Olive Pizza Delivery — Online")
            .setContentText("Location tracking is active while you work.")
            .setContentIntent(pending)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Background Rider Location", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Visible notification while an authenticated rider is online and sharing live location.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private void removeUpdates() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        }
    }

    @Override public void onDestroy() {
        removeUpdates();
        io.shutdown();
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { Log.w(TAG, "Location provider disabled: " + provider); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
}
