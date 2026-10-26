import Foundation

/// APNs device-token formatting. ``environment`` must match `aps-environment`
/// in `Timia.entitlements` (`development` → `sandbox`, `production` → `production`).
enum APNsDeviceToken {
    static let environment = "sandbox"

    static func hexString(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
