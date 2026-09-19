import SwiftUI

enum SchedulePriorityAccent {
    /// Pin / accent hex aligned with schedule card priority styling.
    static func hex(for priority: String?, isCompleted: Bool = false) -> String {
        let accent: String
        switch priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "2", "low":
            accent = "#22C55E"
        case "3", "medium":
            accent = "#EAB308"
        case "4", "high", "urgent":
            accent = "#EF4444"
        default:
            accent = "#3B82F6"
        }
        return isCompleted ? desaturateHex(accent) : accent
    }

    static func color(for priority: String?, isCompleted: Bool = false) -> Color {
        Color(hex: hex(for: priority, isCompleted: isCompleted))
    }
}
