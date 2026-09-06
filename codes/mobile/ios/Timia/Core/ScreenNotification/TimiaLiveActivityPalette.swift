import SwiftUI

enum ColorContrast {
    static func relativeLuminance(hex: String) -> Double {
        guard let rgb = rgbComponents(hex) else { return 0 }
        return 0.2126 * linear(rgb.red) + 0.7152 * linear(rgb.green) + 0.0722 * linear(rgb.blue)
    }

    static func ratio(_ hexA: String, _ hexB: String) -> Double {
        let first = relativeLuminance(hex: hexA)
        let second = relativeLuminance(hex: hexB)
        let lighter = max(first, second)
        let darker = min(first, second)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private static func rgbComponents(_ hex: String) -> (red: Double, green: Double, blue: Double)? {
        let normalized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        guard normalized.count == 6, let value = UInt64(normalized, radix: 16) else {
            return nil
        }
        return (
            Double((value >> 16) & 0xFF) / 255,
            Double((value >> 8) & 0xFF) / 255,
            Double(value & 0xFF) / 255
        )
    }

    private static func linear(_ component: Double) -> Double {
        component <= 0.04045
            ? component / 12.92
            : pow((component + 0.055) / 1.055, 2.4)
    }
}

struct TimiaLiveActivityPalette: Equatable, Sendable {
    let backgroundHex: String
    let primaryTextHex: String
    let secondaryTextHex: String
    let accentHex: String
    let actionForegroundHex: String

    var backgroundTint: Color { Self.color(hex: backgroundHex) }
    var primaryText: Color { Self.color(hex: primaryTextHex) }
    var secondaryText: Color { Self.color(hex: secondaryTextHex) }
    var accent: Color { Self.color(hex: accentHex) }
    var actionForeground: Color { Self.color(hex: actionForegroundHex) }

    static func make(colorScheme: ColorScheme) -> Self {
        switch colorScheme {
        case .dark:
            return Self(
                backgroundHex: "#1C1C1E",
                primaryTextHex: "#F5F5F7",
                secondaryTextHex: "#C7C7CC",
                accentHex: "#7AB0FF",
                actionForegroundHex: "#F5F5F7"
            )
        default:
            return Self(
                backgroundHex: "#F2F2F7",
                primaryTextHex: "#1C1C1E",
                secondaryTextHex: "#3A3A3C",
                accentHex: "#3B6BF0",
                actionForegroundHex: "#1C1C1E"
            )
        }
    }

    private static func color(hex: String) -> Color {
        let normalized = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt64(normalized, radix: 16) ?? 0xFFFFFF
        return Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
