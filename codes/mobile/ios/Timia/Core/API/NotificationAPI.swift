import Foundation

/// Inbox calls against notification-service. Auth stays on the shared ``APIClient``.
struct NotificationAPI: Sendable {
    let client: APIClient

    func inbox(limit: Int = 50) async throws -> NotificationInboxPage {
        try await client.request(
            "/v1/inbox",
            query: [URLQueryItem(name: "limit", value: String(limit))],
            response: NotificationInboxPage.self
        )
    }

    func unreadCount() async throws -> Int {
        try await inbox(limit: 1).unreadCount
    }

    func markRead(id: String) async throws -> InboxNotification {
        try await client.request(
            "/v1/inbox/\(id)/read",
            method: "POST",
            response: InboxNotification.self
        )
    }

    func markAllRead() async throws -> NotificationReadAllResult {
        try await client.request(
            "/v1/inbox/read-all",
            method: "POST",
            response: NotificationReadAllResult.self
        )
    }
}
