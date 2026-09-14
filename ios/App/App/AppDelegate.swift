import UIKit
import Capacitor
import UserNotifications

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
            securityCategory
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

        let backgroundActions = ["ACCEPT_DELIVERY", "ACCEPT", "DECLINE_DELIVERY", "DECLINE", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]

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

    private func executeBackgroundDeliveryAction(
        action: String,
        orderId: String,
        userInfo: [AnyHashable: Any],
        completion: @escaping () -> Void
    ) {
        guard let url = URL(string: "\(backendBaseUrl)/api/delivery/rider/orders/\(orderId)/action") else {
            completion()
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("notif_ios_\(UUID().uuidString)", forHTTPHeaderField: "Idempotency-Key")

        let payload: [String: Any] = [
            "action": action,
            "requestId": "ios_act_\(UUID().uuidString)",
            "source": "PUSH_NOTIFICATION"
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        } catch {
            completion()
            return
        }

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                NSLog("[DeliveryApp] iOS background action network error: %@", error.localizedDescription)
            } else if let httpResponse = response as? HTTPURLResponse {
                NSLog("[DeliveryApp] iOS background action response status: %d", httpResponse.statusCode)
            }
            completion()
        }
        task.resume()
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
