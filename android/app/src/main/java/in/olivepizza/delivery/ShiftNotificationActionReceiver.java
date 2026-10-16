package in.olivepizza.delivery;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Authenticated, native actions for weekly shift-end alerts. */
public class ShiftNotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "ShiftNotificationAction";
    private static final String CONTINUE_URL = "https://olivepizza-owner.onrender.com/api/delivery/rider/schedule/continue";
    private static final ExecutorService IO = Executors.newCachedThreadPool();

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String targetUid = intent.getStringExtra("riderUid");
        int notificationId = intent.getIntExtra("notificationId", 0);
        if ("in.olivepizza.delivery.DONE_SHIFT".equals(action)) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(notificationId);
            return;
        }
        if (!"in.olivepizza.delivery.CONTINUE_SHIFT".equals(action)) return;

        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null || targetUid == null || !targetUid.equals(user.getUid())) {
            Toast.makeText(context, "Please sign in to continue your shift.", Toast.LENGTH_LONG).show();
            return;
        }

        final PendingResult pending = goAsync();
        IO.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String token = Tasks.await(user.getIdToken(false), 15, TimeUnit.SECONDS).getToken();
                if (token == null || token.isEmpty()) throw new IllegalStateException("No valid sign-in token.");
                JSONObject body = new JSONObject();
                body.put("minutes", 60);
                connection = (HttpURLConnection) new URL(CONTINUE_URL).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                connection.setRequestProperty("X-App-Target", "DELIVERY");
                connection.setRequestProperty("X-App-Source", "DELIVERY");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new IllegalStateException("Server rejected shift extension (HTTP " + status + ").");

                // A notification action is an explicit user interaction, so the service may be started here.
                Intent tracking = new Intent(context, RiderBackgroundTrackingService.class);
                tracking.setAction(RiderBackgroundTrackingService.ACTION_START);
                tracking.putExtra(RiderBackgroundTrackingService.EXTRA_UID, targetUid);
                try {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) context.startForegroundService(tracking);
                    else context.startService(tracking);
                } catch (Exception e) {
                    Log.w(TAG, "Shift was extended, but background GPS service could not start.", e);
                }

                NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) manager.cancel(notificationId);
            } catch (Exception e) {
                Log.w(TAG, "Could not continue shift from notification.", e);
                android.os.Handler handler = new android.os.Handler(context.getMainLooper());
                handler.post(() -> Toast.makeText(context, "Couldn't continue work. Open Olive Pizza Delivery and try again.", Toast.LENGTH_LONG).show());
            } finally {
                if (connection != null) connection.disconnect();
                pending.finish();
            }
        });
    }
}
