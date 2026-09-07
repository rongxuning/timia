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
        /// Today's pending all-day todos. Kept as `todos` for ActivityKit payload compatibility.
        var todos: [TodoRow]
        var workingCount: Int
        var doingTodos: [TodoRow]
        var notStartedTodos: [TodoRow]
        var overdueTodos: [TodoRow]

        var notStartedCount: Int { notStartedTodos.count }
        var overdueCount: Int { overdueTodos.count }
        var allDayCount: Int { todos.count }
        var totalCount: Int { workingCount + notStartedCount + overdueCount + allDayCount }

        struct TodoRow: Codable, Hashable, Identifiable, Sendable {
            var id: String
            var title: String
            var timeLabel: String
        }

        enum CodingKeys: String, CodingKey {
            case healthEnabled
            case healthTitle
            case healthTimeLabel
            case todos
            case workingCount
            case doingTodos
            case notStartedTodos
            case overdueTodos
        }

        init(
            healthEnabled: Bool,
            healthTitle: String,
            healthTimeLabel: String,
            todos: [TodoRow],
            workingCount: Int,
            doingTodos: [TodoRow] = [],
            notStartedTodos: [TodoRow] = [],
            overdueTodos: [TodoRow] = []
        ) {
            self.healthEnabled = healthEnabled
            self.healthTitle = healthTitle
            self.healthTimeLabel = healthTimeLabel
            self.todos = todos
            self.workingCount = workingCount
            self.doingTodos = doingTodos
            self.notStartedTodos = notStartedTodos
            self.overdueTodos = overdueTodos
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            healthEnabled = try container.decode(Bool.self, forKey: .healthEnabled)
            healthTitle = try container.decode(String.self, forKey: .healthTitle)
            healthTimeLabel = try container.decode(String.self, forKey: .healthTimeLabel)
            todos = try container.decode([TodoRow].self, forKey: .todos)
            workingCount = try container.decode(Int.self, forKey: .workingCount)
            doingTodos = try container.decodeIfPresent([TodoRow].self, forKey: .doingTodos) ?? []
            notStartedTodos = try container.decodeIfPresent([TodoRow].self, forKey: .notStartedTodos) ?? []
            overdueTodos = try container.decodeIfPresent([TodoRow].self, forKey: .overdueTodos) ?? []
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(healthEnabled, forKey: .healthEnabled)
            try container.encode(healthTitle, forKey: .healthTitle)
            try container.encode(healthTimeLabel, forKey: .healthTimeLabel)
            try container.encode(todos, forKey: .todos)
            try container.encode(workingCount, forKey: .workingCount)
            try container.encode(doingTodos, forKey: .doingTodos)
            try container.encode(notStartedTodos, forKey: .notStartedTodos)
            try container.encode(overdueTodos, forKey: .overdueTodos)
        }
    }
}

#if canImport(ActivityKit)
extension TimiaScreenActivityAttributes: ActivityAttributes {}
#endif
