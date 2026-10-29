import Contacts
import Foundation

/// Me-card phone numbers for the login screen. SMS-verified storage is preferred
/// by `PhoneDisplay` and never written from here.
@MainActor
enum OwnCardPhone {
    static func candidates() async -> [(label: String, number: String)] {
        guard TimiaOwnCardPhoneSupported() else { return [] }
        guard await ensureAccess() else { return [] }
        return TimiaOwnCardPhoneCandidates().compactMap { row in
            let number = row["number"] ?? ""
            guard !number.isEmpty else { return nil }
            return (label: row["label"] ?? "", number: number)
        }
    }

    private static func ensureAccess() async -> Bool {
        let store = CNContactStore()
        if CNContactStore.authorizationStatus(for: .contacts) == .notDetermined {
            _ = try? await store.requestAccess(for: .contacts)
        }
        let status = CNContactStore.authorizationStatus(for: .contacts)
        if status == .authorized { return true }
        if #available(iOS 18, *), status == .limited { return true }
        return false
    }
}
