import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

/// Lock-screen Live Activity payload shared by the app and widget extension.
struct TimiaScreenActivityAttributes: Codable, Hashable, Sendable {
    /// Fixed attributes for the activity lifetime.
    var title: String

    struct ContentState: Codable, Hashable, Sendable {
        var healthEnabled: Bool
        var healthTitle: String
        var healthTimeLabel: String
        var todos: [TodoRow]
        var workingCount: Int

        struct TodoRow: Codable, Hashable, Identifiable, Sendable {
            var id: String
            var title: String
            var timeLabel: String
        }
    }
}

#if canImport(ActivityKit)
extension TimiaScreenActivityAttributes: ActivityAttributes {}
#endif
