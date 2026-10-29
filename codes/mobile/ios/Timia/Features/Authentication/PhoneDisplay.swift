import Foundation

enum PhoneDisplay {
    static let storageKey = "timia.login.phone"

    /// Last SMS-verified number in `UserDefaults`, masked, or nil when none is stored.
    /// iOS does not expose the SIM number. Callers that still have no mask may ask
    /// Contacts for the Me card; they must not invent a placeholder.
    static func storedMask(defaults: UserDefaults = .standard) -> String? {
        resolvedMask(stored: defaults.string(forKey: storageKey))
    }

    static func remember(_ e164: String) {
        UserDefaults.standard.set(e164, forKey: storageKey)
    }

    /// Prefix 3 + `****` + suffix 4. Returns nil when there are fewer than 7 digits.
    static func mask(_ raw: String) -> String? {
        var digits = raw.filter(\.isNumber)
        if digits.hasPrefix("86"), digits.count >= 13 {
            digits.removeFirst(2)
        }
        guard digits.count >= 7 else { return nil }
        return "\(digits.prefix(3))****\(digits.suffix(4))"
    }

    /// Stored SMS number wins. Otherwise the first maskable Me-card number,
    /// preferring mobile / iPhone labels. Nil when nothing real is available.
    static func resolvedMask(
        stored: String?,
        contactPhones: [(label: String, number: String)] = []
    ) -> String? {
        if let stored, let masked = mask(stored) {
            return masked
        }
        guard let number = preferredNumber(from: contactPhones) else { return nil }
        return mask(number)
    }

    static func preferredNumber(from candidates: [(label: String, number: String)]) -> String? {
        let ranked = candidates.enumerated().sorted { lhs, rhs in
            let left = labelRank(lhs.element.label)
            let right = labelRank(rhs.element.label)
            if left != right { return left < right }
            return lhs.offset < rhs.offset
        }
        return ranked.lazy.compactMap { mask($0.element.number) == nil ? nil : $0.element.number }.first
    }

    static func normalize(_ raw: String) throws -> String {
        let compact = raw.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
        let digits: String
        if compact.hasPrefix("+") {
            digits = "+" + compact.dropFirst().filter(\.isNumber)
        } else {
            let only = compact.filter(\.isNumber)
            if only.count == 11, only.hasPrefix("1") {
                digits = "+86" + only
            } else if only.hasPrefix("86"), only.count == 13 {
                digits = "+" + only
            } else {
                digits = "+" + only
            }
        }
        let national = digits.dropFirst()
        guard national.allSatisfy(\.isNumber), (8...15).contains(national.count) else {
            throw APIError.transport("请输入有效手机号")
        }
        return digits
    }

    private static func labelRank(_ label: String) -> Int {
        let value = label.lowercased()
        if value.contains("mobile") || value.contains("iphone") { return 0 }
        if value.contains("main") { return 1 }
        if value.contains("home") || value.contains("work") { return 2 }
        return 3
    }
}
