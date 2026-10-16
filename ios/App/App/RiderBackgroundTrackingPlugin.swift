import Foundation
import CoreLocation
import Capacitor
import FirebaseAuth

@objc(RiderBackgroundTrackingPlugin)
public class RiderBackgroundTrackingPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "RiderBackgroundTrackingPlugin"
    public let jsName = "RiderBackgroundTracking"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private static let uidKey = "olive_rider_background_tracking_uid"
    private var locationManager: CLLocationManager?
    private var riderUid: String?
    private var shiftEndObserver: NSObjectProtocol?

    override public func load() {
        super.load()
        configureLocationManager()
        shiftEndObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("OliveRiderBackgroundTrackingStop"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.stopPersistedTracking()
        }
        if let savedUid = UserDefaults.standard.string(forKey: Self.uidKey), !savedUid.isEmpty {
            riderUid = savedUid
            startIfAuthorized()
        }
    }

    @objc public func start(_ call: CAPPluginCall) {
        guard let uid = call.getString("uid"), !uid.isEmpty else {
            call.reject("An authenticated rider account is required.")
            return
        }
        guard let user = Auth.auth().currentUser, user.uid == uid else {
            call.reject("Sign in to the matching Olive Pizza delivery rider account first.")
            return
        }
        guard CLLocationManager.locationServicesEnabled() else {
            call.reject("Turn on Location Services before going online.")
            return
        }

        riderUid = uid
        UserDefaults.standard.set(uid, forKey: Self.uidKey)
        configureLocationManager()
        guard let manager = locationManager else {
            call.reject("Could not initialize background location tracking.")
            return
        }

        switch manager.authorizationStatus {
        case .denied, .restricted:
            call.reject("Location permission is denied. Allow location access in iPhone Settings.")
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
            call.resolve(["state": "permission_requested"])
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            startIfAuthorized()
            call.resolve(["state": "tracking_starting", "permission": "when_in_use"])
        case .authorizedAlways:
            startIfAuthorized()
            call.resolve(["state": "tracking"])
        @unknown default:
            call.reject("The current iOS location permission state is not supported.")
        }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        stopPersistedTracking()
        call.resolve(["state": "stopped"])
    }

    private func stopPersistedTracking() {
        UserDefaults.standard.removeObject(forKey: Self.uidKey)
        riderUid = nil
        if let manager = locationManager {
            manager.stopUpdatingLocation()
            manager.stopMonitoringSignificantLocationChanges()
            manager.allowsBackgroundLocationUpdates = false
        }
    }

    deinit {
        if let observer = shiftEndObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    private func configureLocationManager() {
        if locationManager != nil { return }
        let manager = CLLocationManager()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        locationManager = manager
    }

    private func startIfAuthorized() {
        guard
            let manager = locationManager,
            let uid = riderUid,
            let user = Auth.auth().currentUser,
            user.uid == uid,
            CLLocationManager.locationServicesEnabled(),
            manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse
        else { return }

        // Info.plist includes the location background mode. Starting while the app is
        // visible lets Core Location keep the app eligible for background updates.
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        manager.startMonitoringSignificantLocationChanges()
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            startIfAuthorized()
        case .authorizedAlways:
            startIfAuthorized()
        case .denied, .restricted:
            NSLog("[RiderBackgroundTracking] Background tracking paused because location permission is denied.")
        default:
            break
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, let uid = riderUid else { return }
        guard let user = Auth.auth().currentUser, user.uid == uid else {
            NSLog("[RiderBackgroundTracking] Authenticated rider changed; stopping location updates.")
            manager.stopUpdatingLocation()
            manager.stopMonitoringSignificantLocationChanges()
            return
        }

        user.getIDTokenForcingRefresh(false) { token, error in
            guard let token = token, error == nil else {
                NSLog("[RiderBackgroundTracking] Could not obtain a current auth token for location upload.")
                return
            }
            var request = URLRequest(url: URL(string: "https://olivepizza-owner.onrender.com/api/delivery/rider/status")!)
            request.httpMethod = "POST"
            request.timeoutInterval = 10
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("DELIVERY", forHTTPHeaderField: "X-App-Target")
            request.setValue("DELIVERY", forHTTPHeaderField: "X-App-Source")
            let body: [String: Any] = [
                "isOnline": true,
                "backgroundService": true,
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy
            ]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
            URLSession.shared.dataTask(with: request) { _, response, error in
                if let error = error {
                    NSLog("[RiderBackgroundTracking] Location upload failed: %@", error.localizedDescription)
                } else if let response = response as? HTTPURLResponse, !(200..<300).contains(response.statusCode) {
                    NSLog("[RiderBackgroundTracking] Location upload returned HTTP %d", response.statusCode)
                    if [401, 403, 409].contains(response.statusCode) {
                        // A revoked account or completed shift must stop collection, not retry forever.
                        DispatchQueue.main.async {
                            NotificationCenter.default.post(
                                name: Notification.Name("OliveRiderBackgroundTrackingStop"),
                                object: nil
                            )
                        }
                    }
                }
            }.resume()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("[RiderBackgroundTracking] Location update error: %@", error.localizedDescription)
    }
}
