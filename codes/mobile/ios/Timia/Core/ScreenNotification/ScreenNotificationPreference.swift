import Foundation

enum ScreenNotificationPreference: String, Sendable {
    case unset
    case allowed
    case denied

    static let storageKey = "timia.screenNotification.preference"

    static var current: ScreenNotificationPreference {
        get {
            guard let raw = UserDefaults.standard.string(forKey: storageKey),
                  let value = ScreenNotificationPreference(rawValue: raw) else {
                return .unset
            }
            return value
        }
        set {
            if newValue == .unset {
                UserDefaults.standard.removeObject(forKey: storageKey)
            } else {
                UserDefaults.standard.set(newValue.rawValue, forKey: storageKey)
            }
        }
    }

    var isAllowed: Bool { self == .allowed }
}
