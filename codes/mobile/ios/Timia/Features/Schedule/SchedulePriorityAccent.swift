import SwiftUI

/// Task-priority buckets shared by schedule cards and the Todo date strip.
/// Stack order is high → medium → low → other.
enum SchedulePriorityBand: String, CaseIterable, Hashable, Sendable {
    case high
    case medium
    case low
    case other

    static let topToBottom: [SchedulePriorityBand] = [.high, .medium, .low, .other]

    /// Token that selects this bucket from `SchedulePriorityAccent.palette(for:)`.
    var priorityToken: String {
        switch self {
        case .high: "4"
        case .medium: "3"
        case .low: "2"
        case .other: "1"
        }
    }
}

enum SchedulePriorityAccent {
    struct Palette: Equatable {
        let background: String
        let foreground: String
        let accent: String
    }

    static func band(for priority: String?) -> SchedulePriorityBand {
        switch priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "2", "low":
            return .low
        case "3", "medium":
            return .medium
        case "4", "high", "urgent":
            return .high
        default:
            return .other
        }
    }

    static func palette(
        for priority: String?,
        isDark: Bool = false,
        isCompleted: Bool = false
    ) -> Palette {
        palette(for: band(for: priority), isDark: isDark, isCompleted: isCompleted)
    }

    static func palette(
        for band: SchedulePriorityBand,
        isDark: Bool = false,
        isCompleted: Bool = false
    ) -> Palette {
        let raw: Palette
        switch band {
        case .low:
            raw = Palette(
                background: isDark ? "#123D26" : "#DCFCE7",
                foreground: isDark ? "#86EFAC" : "#15803D",
                accent: "#22C55E"
            )
        case .medium:
            raw = Palette(
                background: isDark ? "#422F08" : "#FEF9C3",
                foreground: isDark ? "#FDE68A" : "#854D0E",
                accent: "#EAB308"
            )
        case .high:
            raw = Palette(
                background: isDark ? "#4A1618" : "#FEE2E2",
                foreground: isDark ? "#FCA5A5" : "#B91C1C",
                accent: "#EF4444"
            )
        case .other:
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
