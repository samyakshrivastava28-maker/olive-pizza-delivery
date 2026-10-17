package in.olivepizza.delivery;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RiderBackgroundTracking")
public class RiderBackgroundTrackingPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String uid = call.getString("uid");
        String apiBaseUrl = call.getString("apiBaseUrl");
        if (uid == null || uid.trim().isEmpty()) {
            call.reject("An authenticated rider account is required.");
            return;
        }
        Intent intent = new Intent(getContext(), RiderBackgroundTrackingService.class);
        intent.setAction(RiderBackgroundTrackingService.ACTION_START);
        intent.putExtra(RiderBackgroundTrackingService.EXTRA_UID, uid);
        intent.putExtra(RiderBackgroundTrackingService.EXTRA_BASE_URL, apiBaseUrl);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Background location service could not start. Check location permissions.", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), RiderBackgroundTrackingService.class);
            intent.setAction(RiderBackgroundTrackingService.ACTION_STOP);
            getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Background location service could not stop.", e);
        }
    }
}
