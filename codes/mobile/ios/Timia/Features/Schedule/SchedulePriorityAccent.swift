import SwiftUI

enum SchedulePriorityAccent {
    struct Palette: Equatable {
        let background: String
        let foreground: String
        let accent: String
    }

    static func palette(
        for priority: String?,
        isDark: Bool = false,
        isCompleted: Bool = false
    ) -> Palette {
        let raw: Palette
        switch priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "2", "low":
            raw = Palette(
                background: isDark ? "#123D26" : "#DCFCE7",
                foreground: isDark ? "#86EFAC" : "#15803D",
                accent: "#22C55E"
            )
        case "3", "medium":
            raw = Palette(
                background: isDark ? "#422F08" : "#FEF9C3",
                foreground: isDark ? "#FDE68A" : "#854D0E",
                accent: "#EAB308"
            )
        case "4", "high", "urgent":
            raw = Palette(
                background: isDark ? "#4A1618" : "#FEE2E2",
                foreground: isDark ? "#FCA5A5" : "#B91C1C",
                accent: "#EF4444"
            )
        default:
            raw = Palette(
                background: isDark ? "#172554" : "#DBEAFE",
                foreground: isDark ? "#93C5FD" : "#1D4ED8",
                accent: "#3B82F6"
            )
        }
        return Palette(
            background: isCompleted ? desaturateHex(raw.background) : raw.background,
            foreground: raw.foreground,
            accent: isCompleted ? desaturateHex(raw.accent) : raw.accent
        )
    }

    /// Pin / accent hex aligned with schedule card priority styling.
    static func hex(for priority: String?, isCompleted: Bool = false) -> String {
        palette(for: priority, isCompleted: isCompleted).accent
    }

    static func color(for priority: String?, isCompleted: Bool = false) -> Color {
        Color(hex: hex(for: priority, isCompleted: isCompleted))
    }
}
