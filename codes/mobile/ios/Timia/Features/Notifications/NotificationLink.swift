import Foundation

/// In-app paths stored on a notification. Web uses `/workspace/...`; iOS API paths use `/workspaces/...`.
enum NotificationAppLink: Hashable, Equatable {
    case task(workspaceId: String, projectId: String, itemId: String)
    case project(workspaceId: String, projectId: String)
    case workspace(workspaceId: String)
}

enum NotificationLinkParser {
    static func parse(_ raw: String?) -> NotificationAppLink? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("/"), !trimmed.hasPrefix("//") else { return nil }
        let withoutQuery = trimmed.split(separator: "?", maxSplits: 1).first.map(String.init) ?? trimmed
        let path = withoutQuery.split(separator: "#", maxSplits: 1).first.map(String.init) ?? withoutQuery
        let parts = path.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        guard parts.count >= 2, parts[0] == "workspace" || parts[0] == "workspaces" else { return nil }
        let workspaceId = parts[1]
        if parts.count == 2 {
            return .workspace(workspaceId: workspaceId)
        }
        guard parts.count >= 4, parts[2] == "projects" else { return nil }
        let projectId = parts[3]
        if parts.count == 4 {
            return .project(workspaceId: workspaceId, projectId: projectId)
        }
        guard parts.count == 6, parts[4] == "items", !parts[5].isEmpty else { return nil }
        return .task(workspaceId: workspaceId, projectId: projectId, itemId: parts[5])
    }
}

enum NotificationTimeText {
    static func parse(_ iso: String) -> Date? {
        let normalized = iso.replacingOccurrences(of: "+00:00", with: "Z")
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: normalized) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: normalized)
    }

    static func string(from iso: String) -> String {
        guard let date = parse(iso) else { return iso }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
