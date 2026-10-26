import Foundation

/// APNs device-token formatting. ``environment`` must match `aps-environment`
/// in `Timia.entitlements` (`development` → `sandbox`, `production` → `production`).
/// This app target uses production for TestFlight and the App Store.
enum APNsDeviceToken {
    static let environment = "production"

    static func hexString(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
