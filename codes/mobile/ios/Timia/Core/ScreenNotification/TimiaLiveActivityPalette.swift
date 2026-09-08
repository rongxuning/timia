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

enum TaskProgressStyle {
    static let todoHex = "#64748B"
    static let doingHex = "#3B82F6"
    static let doneHex = "#10B981"
    static let archivedHex = "#8B5CF6"

    static func colorHex(for status: String) -> String {
        switch status {
        case "doing": doingHex
        case "done": doneHex
        case "archived": archivedHex
        default: todoHex
        }
    }

    static func symbolName(for status: String) -> String {
        switch status {
        case "doing": "clock.fill"
        case "done": "checkmark.circle.fill"
        case "archived": "archivebox.fill"
        default: "circle"
        }
    }

    static func accessibilityLabel(for status: String) -> String {
        switch status {
        case "doing": "进行中"
        case "done": "已完成"
        case "archived": "已归档"
        default: "未开始"
        }
    }
}

struct TimiaLiveActivityPalette: Equatable, Sendable {
    let backgroundHex: String
    let backgroundOpacity: Double
    let primaryTextHex: String
    let secondaryTextHex: String
    let accentHex: String
    let actionForegroundHex: String
    let isDark: Bool

    var forcedColorScheme: ColorScheme { isDark ? .dark : .light }
    var backgroundTint: Color { Self.color(hex: backgroundHex).opacity(backgroundOpacity) }
    var primaryText: Color { Self.color(hex: primaryTextHex) }
    var secondaryText: Color { Self.color(hex: secondaryTextHex) }
    var accent: Color { Self.color(hex: accentHex) }
    var actionForeground: Color { Self.color(hex: actionForegroundHex) }

    func color(fromHex hex: String) -> Color {
        Self.color(hex: hex)
    }

    static func make(colorScheme: ColorScheme) -> Self {
        switch colorScheme {
        case .dark:
            // Opaque system-dark surface so lock-screen text stays readable
            // over busy wallpapers (no frosted bleed-through).
            return Self(
                backgroundHex: "#1C1C1E",
                backgroundOpacity: 1.0,
                primaryTextHex: "#FFFFFF",
                secondaryTextHex: "#8E8E93",
                accentHex: "#0A84FF",
                actionForegroundHex: "#FFFFFF",
                isDark: true
            )
        default:
            return Self(
                backgroundHex: "#FFFFFF",
                backgroundOpacity: 0.78,
                primaryTextHex: "#000000",
                secondaryTextHex: "#3A3A3C",
                accentHex: "#007AFF",
                actionForegroundHex: "#000000",
                isDark: false
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
