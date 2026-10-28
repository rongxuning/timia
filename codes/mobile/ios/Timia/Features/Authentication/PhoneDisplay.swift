import Foundation

enum PhoneDisplay {
    static let placeholder = "138****5678"
    static let storageKey = "timia.login.phone"

    /// iOS does not expose the carrier phone number. Show the last verified
    /// number when we have one, otherwise the placeholder mask.
    static func storedMask() -> String {
        let raw = UserDefaults.standard.string(forKey: storageKey) ?? ""
        return raw.isEmpty ? placeholder : mask(raw)
    }

    static func remember(_ e164: String) {
        UserDefaults.standard.set(e164, forKey: storageKey)
    }

    static func mask(_ raw: String) -> String {
        var digits = raw.filter(\.isNumber)
        if digits.hasPrefix("86"), digits.count >= 13 {
            digits.removeFirst(2)
        }
        guard digits.count >= 7 else { return placeholder }
        return "\(digits.prefix(3))****\(digits.suffix(4))"
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
}
