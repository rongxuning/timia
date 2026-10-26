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

    func registerDeviceToken(_ token: String) async throws -> DevicePushTokenResult {
        try await client.request(
            "/v1/devices/apns",
            method: "POST",
            body: DevicePushTokenBody(token: token, environment: APNsDeviceToken.environment),
            response: DevicePushTokenResult.self
        )
    }

    func unregisterDeviceToken(_ token: String) async throws {
        _ = try await client.request(
            "/v1/devices/apns/\(token)",
            method: "DELETE",
            timeoutInterval: 5,
            response: EmptyResponse.self
        )
    }
}

struct DevicePushTokenBody: Encodable, Sendable {
    let token: String
    let environment: String
}

struct DevicePushTokenResult: Decodable, Sendable {
    let id: String
    let environment: String
    let platform: String
}
