import Foundation

/// Resolves the notification-service base URL.
///
/// Prefer `TIMIA_NOTIFICATION_API_BASE_URL`. When that key is empty, swap the
/// core-service path for `/notification-service` so local nginx and production
/// keep the same host.
enum NotificationServiceURL {
    static func resolve(configured: String?, apiBaseURL: URL) -> URL {
        let trimmed = configured?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty, let url = URL(string: trimmed), url.scheme == "http" || url.scheme == "https" {
            return url
        }
        guard var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false) else {
            return URL(string: "https://timia.online/notification-service")!
        }
        var path = components.path
        if path.hasSuffix("/") {
            path.removeLast()
        }
        let coreSuffix = "/core-service"
        if path.hasSuffix(coreSuffix) {
            path = String(path.dropLast(coreSuffix.count)) + "/notification-service"
        } else if !path.hasSuffix("/notification-service") {
            if path.isEmpty {
                path = "/notification-service"
            } else {
                path += "/notification-service"
            }
        }
        components.path = path
        return components.url ?? URL(string: "https://timia.online/notification-service")!
    }
}
