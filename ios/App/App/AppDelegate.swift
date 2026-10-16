import UIKit
import Capacitor
import UserNotifications
import FirebaseAuth

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private let backendBaseUrl = "https://olivepizza-owner.onrender.com"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        registerNotificationCategories()
        UIApplication.shared.registerForRemoteNotifications()
        return true
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        let type = (userInfo["type"] as? String ?? "").uppercased()
        let targetUid = userInfo["riderUid"] as? String

        if type == "WORK_SHIFT_STARTED", let targetUid = targetUid {
            // Best effort only: iOS may deliver background pushes late or not at all,
            // and never relaunches the app after a user force-quits it.
            UserDefaults.standard.set(targetUid, forKey: "olive_rider_pending_shift_start_uid")
            NotificationCenter.default.post(
                name: Notification.Name("OliveRiderBackgroundTrackingStart"),
                object: userInfo
            )
            completionHandler(.newData)
            return
        }

        if type == "WORK_SHIFT_ENDED" {
            UserDefaults.standard.removeObject(forKey: "olive_rider_pending_shift_start_uid")
            NotificationCenter.default.post(name: Notification.Name("OliveRiderBackgroundTrackingStop"), object: nil)
            completionHandler(.newData)
            return
        }

        completionHandler(.noData)
    }

    private func registerNotificationCategories() {
        let viewOrderAction = UNNotificationAction(
            identifier: "VIEW_ORDER",
            title: "📱 View Order",
            options: [.foreground]
        )

        // 1. New Assignment Category
        let acceptDeliveryAction = UNNotificationAction(
            identifier: "ACCEPT_DELIVERY",
            title: "✅ Accept",
            options: [.authenticationRequired]
        )
        let declineDeliveryAction = UNNotificationAction(
            identifier: "DECLINE_DELIVERY",
            title: "❌ Decline",
            options: [.destructive, .authenticationRequired]
        )
        let deliveryCategory = UNNotificationCategory(
            identifier: "DELIVERY_ASSIGNMENT_CATEGORY",
            actions: [acceptDeliveryAction, declineDeliveryAction, viewOrderAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // 2. Accepted / At Store Category
        let pickedUpAction = UNNotificationAction(
            identifier: "PICKED_UP",
            title: "📦 Picked Up",
            options: [.authenticationRequired]
        )
        let acceptedCategory = UNNotificationCategory(
            identifier: "DELIVERY_ORDER_ACCEPTED",
            actions: [pickedUpAction, viewOrderAction],
            intentIdentifiers: [],
            options: []
        )

        // 3. Picked Up Category
        let outForDeliveryAction = UNNotificationAction(
            identifier: "OUT_FOR_DELIVERY",
            title: "🛵 Out for Delivery",
            options: [.authenticationRequired]
        )
        let pickedUpCategory = UNNotificationCategory(
            identifier: "DELIVERY_ORDER_PICKED_UP",
            actions: [outForDeliveryAction, viewOrderAction],
            intentIdentifiers: [],
            options: []
        )

        // 4. Out For Delivery Category
        let deliveredAction = UNNotificationAction(
            identifier: "DELIVERED",
            title: "✅ Delivered",
            options: [.authenticationRequired]
        )
        let outForDeliveryCategory = UNNotificationCategory(
            identifier: "DELIVERY_ORDER_OUT_FOR_DELIVERY",
            actions: [deliveredAction, viewOrderAction],
            intentIdentifiers: [],
            options: []
        )

        // 5. Weekly work-time notifications (standard iOS actionable notifications; no system-wide overlay).
        let workShiftContinueAction = UNNotificationAction(
            identifier: "CONTINUE_SHIFT",
            title: "Continue 1 Hour",
            options: [.authenticationRequired, .foreground]
        )
        let workShiftDoneAction = UNNotificationAction(
            identifier: "DONE_SHIFT",
            title: "Done for Today",
            options: [.authenticationRequired]
        )
        let workShiftEndedCategory = UNNotificationCategory(
            identifier: "WORK_SHIFT_ENDED",
            actions: [workShiftContinueAction, workShiftDoneAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        let workShiftStartedCategory = UNNotificationCategory(
            identifier: "WORK_SHIFT_STARTED",
            actions: [viewOrderAction],
            intentIdentifiers: [],
            options: []
        )

        // 5. Security & System Alerts
        let viewAlertAction = UNNotificationAction(
            identifier: "VIEW_ALERT",
            title: "⚠️ View Alert",
            options: [.foreground, .authenticationRequired]
        )
        let securityCategory = UNNotificationCategory(
            identifier: "SECURITY_ALERT_CATEGORY",
            actions: [viewAlertAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            deliveryCategory,
            acceptedCategory,
            pickedUpCategory,
            outForDeliveryCategory,
            securityCategory,
            workShiftEndedCategory,
            workShiftStartedCategory
        ])
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge, .list])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let actionIdentifier = response.actionIdentifier
        let orderId = (userInfo["orderId"] as? String) ?? (userInfo["order_id"] as? String)

        if actionIdentifier == "DONE_SHIFT" {
            NotificationCenter.default.post(name: Notification.Name("OliveRiderBackgroundTrackingStop"), object: nil)
            NotificationCenter.default.post(
                name: Notification.Name("CapacitorNotificationAction"),
                object: ["action": actionIdentifier, "data": userInfo]
            )
            completionHandler()
            return
        }

        let backgroundActions = ["ACCEPT_DELIVERY", "ACCEPT", "DECLINE_DELIVERY", "DECLINE", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]

        if actionIdentifier == "CONTINUE_SHIFT" {
            executeBackgroundShiftContinuation(userInfo: userInfo) {
                NotificationCenter.default.post(
                    name: Notification.Name("CapacitorNotificationAction"),
                    object: ["action": actionIdentifier, "data": userInfo]
                )
                completionHandler()
            }
            return
        }
        if backgroundActions.contains(actionIdentifier), let orderId = orderId, !orderId.isEmpty {
            executeBackgroundDeliveryAction(action: actionIdentifier, orderId: orderId, userInfo: userInfo) {
                NotificationCenter.default.post(
                    name: Notification.Name("CapacitorNotificationAction"),
                    object: [
                        "action": actionIdentifier,
                        "data": userInfo
                    ]
                )
                completionHandler()
            }
        } else {
            NotificationCenter.default.post(
                name: Notification.Name("CapacitorNotificationAction"),
                object: [
                    "action": actionIdentifier,
                    "data": userInfo
                ]
            )
            completionHandler()
        }
    }


    private func executeBackgroundShiftContinuation(
        userInfo: [AnyHashable: Any],
        completion: @escaping () -> Void
    ) {
        guard
            let targetUid = userInfo["riderUid"] as? String,
            let user = Auth.auth().currentUser,
            user.uid == targetUid,
            let url = URL(string: "\(backendBaseUrl)/api/delivery/rider/schedule/continue")
        else {
            NSLog("[DeliveryApp] Ignoring shift continuation without matching authenticated rider.")
            completion()
            return
        }

        user.getIDTokenForcingRefresh(false) { token, error in
            guard let token = token, error == nil else {
                NSLog("[DeliveryApp] Could not obtain a valid token for shift continuation.")
                completion()
                return
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("DELIVERY", forHTTPHeaderField: "X-App-Target")
            request.setValue("DELIVERY", forHTTPHeaderField: "X-App-Source")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["minutes": 60], options: [])
            URLSession.shared.dataTask(with: request) { _, response, error in
                if let error = error {
                    NSLog("[DeliveryApp] Shift extension failed: %@", error.localizedDescription)
                } else if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                    NSLog("[DeliveryApp] Shift extension was rejected with HTTP %d", http.statusCode)
                }
                completion()
            }.resume()
        }
    }

    private func executeBackgroundDeliveryAction(
        action: String,
        orderId: String,
        userInfo: [AnyHashable: Any],
        completion: @escaping () -> Void
    ) {
        guard
            let recipientUid = userInfo["recipientUid"] as? String,
            let user = Auth.auth().currentUser,
            user.uid == recipientUid,
            let encodedOrderId = orderId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
            let url = URL(string: "\(backendBaseUrl)/api/delivery/rider/orders/\(encodedOrderId)/action")
        else {
            NSLog("[DeliveryApp] Ignoring order action without matching authenticated rider recipient.")
            completion()
            return
        }

        user.getIDTokenForcingRefresh(false) { token, tokenError in
            guard let token = token, tokenError == nil else {
                NSLog("[DeliveryApp] Could not obtain an ID token for the order action.")
                completion()
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("DELIVERY", forHTTPHeaderField: "X-App-Target")
            request.setValue("DELIVERY", forHTTPHeaderField: "X-App-Source")
            request.setValue("notif_ios_\(UUID().uuidString)", forHTTPHeaderField: "Idempotency-Key")

            let payload: [String: Any] = [
                "action": action,
                "requestId": "ios_act_\(UUID().uuidString)",
                "source": "PUSH_NOTIFICATION",
                "recipientUid": recipientUid
            ]

            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
            } catch {
                completion()
                return
            }

            URLSession.shared.dataTask(with: request) { _, response, error in
                if let error = error {
                    NSLog("[DeliveryApp] iOS background action network error: %@", error.localizedDescription)
                } else if let httpResponse = response as? HTTPURLResponse {
                    NSLog("[DeliveryApp] iOS background action response status: %d", httpResponse.statusCode)
                }
                completion()
            }.resume()
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
