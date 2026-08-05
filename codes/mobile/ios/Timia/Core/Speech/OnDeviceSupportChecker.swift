import Foundation
import Speech
import UIKit

/// Detects whether the device can run Chinese speech recognition fully
/// on-device (no audio uploaded to Apple).
///
/// Requires:
///   * ``SFSpeechRecognizer.supportsOnDeviceRecognition == true``
///   * The user has downloaded the Chinese (Simplified) offline dictation
///     pack in Settings → General → Keyboard → Dictation.
enum OnDeviceSupportChecker {
    /// The locale we always use for sticky-note voice input. v1 is Chinese-only.
    static let locale: Locale = Locale(identifier: "zh-CN")

    /// Bundle identifier the iOS Settings app will deep-link to.
    static var appBundleID: String {
        Bundle.main.bundleIdentifier ?? "com.timia.app"
    }

    enum Availability: Equatable {
        case available
        /// Device hardware doesn't support on-device recognition (e.g. A8 / iOS 12 and below).
        case deviceNotSupported
        /// Locale is not installed locally; user must download it.
        case localeNotInstalled
        /// A recognizer for the requested locale does not exist at all.
        case localeUnavailable
    }

    static func check() -> Availability {
        guard let recognizer = SFSpeechRecognizer(locale: locale) else {
            return .localeUnavailable
        }
        guard recognizer.supportsOnDeviceRecognition else {
            return .deviceNotSupported
        }
        guard recognizer.isAvailable else {
            return .localeNotInstalled
        }
        return .available
    }

    static var settingsDeepLinkURL: URL? {
        // Settings → General → Keyboard → Dictation lives under app-specific
        // settings; for v1 we open the app's own settings pane, which is
        // the path of least surprise for users coming from a permission alert.
        URL(string: UIApplication.openSettingsURLString)
    }
}
