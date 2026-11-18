import Foundation
import CallKit
import AVFoundation

/**
 * OrderCallKitService — Native iOS CallKit implementation for rider assignment alerts.
 */
@objc public class OrderCallKitService: NSObject, CXProviderDelegate {
    @objc public static let shared = OrderCallKitService()
    private var provider: CXProvider?
    private var callController = CXCallController()
    
    private override init() {
        super.init()
        let configuration = CXProviderConfiguration(localizedName: "Olive Pizza Delivery")
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.ringtoneSound = "delivery_chime.wav"
        
        provider = CXProvider(configuration: configuration)
        provider?.setDelegate(self, queue: nil)
    }
    
    @objc public func reportIncomingAssignment(orderId: String, orderNumber: String, customerName: String, totalAmount: String) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Delivery: \(orderNumber) • ₹\(totalAmount)")
        update.localizedCallerName = "🛵 New Delivery Assignment: \(orderNumber)"
        update.hasVideo = false
        
        let uuid = UUID(uuidString: orderId) ?? UUID()
        provider?.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                NSLog("[CallKit] Error reporting incoming delivery call: %@", error.localizedDescription)
            } else {
                NSLog("[CallKit] Incoming delivery assignment displayed for %@", orderNumber)
            }
        }
    }
    
    @objc public func endIncomingAssignment(orderId: String) {
        let uuid = UUID(uuidString: orderId) ?? UUID()
        let endAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endAction)
        callController.request(transaction) { error in
            if let error = error {
                NSLog("[CallKit] Error ending delivery call: %@", error.localizedDescription)
            }
        }
    }
    
    public func providerDidReset(_ provider: CXProvider) {}
    
    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("DeliveryCallKitAccepted"),
            object: ["orderId": action.callUUID.uuidString]
        )
        action.fulfill()
    }
    
    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("DeliveryCallKitDismissed"),
            object: ["orderId": action.callUUID.uuidString]
        )
        action.fulfill()
    }
}
