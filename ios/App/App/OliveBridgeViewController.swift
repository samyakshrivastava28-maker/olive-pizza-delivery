import UIKit
import Capacitor

class OliveBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RiderBackgroundTrackingPlugin())
    }
}
