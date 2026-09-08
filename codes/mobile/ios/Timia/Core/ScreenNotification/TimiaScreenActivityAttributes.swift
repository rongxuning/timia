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
        /// Dynamic Island / compact badge: header buckets + all-day + optional health row.
        var totalCount: Int {
            workingCount + allDayCount + (healthEnabled ? 1 : 0)
        }

        /// Max lock-screen item rows, including a trailing overflow row when truncated.
        static let lockScreenVisibleRowLimit = 7

        enum LockScreenItem: Equatable, Identifiable, Sendable {
            case health
            case todo(TodoRow)
            case more(remaining: Int)

            static let moreTitle = "more"

            static func moreTitle(remaining: Int) -> String {
                remaining > 0 ? "还有 \(remaining) 项" : moreTitle
            }

            var id: String {
                switch self {
                case .health: "health"
                case .todo(let row): row.id
                case .more: "more"
                }
            }
        }

        var showsWorkingHeader: Bool { workingCount > 0 }

        var workingHeaderTitle: String { "\(workingCount) 进行中" }

        func lockScreenItems(maxRows: Int = Self.lockScreenVisibleRowLimit) -> [LockScreenItem] {
            var items: [LockScreenItem] = []
            if healthEnabled {
                items.append(.health)
            }
            items.append(contentsOf: doingTodos.map { .todo($0) })
            items.append(contentsOf: notStartedTodos.map { .todo($0) })
            items.append(contentsOf: overdueTodos.map { .todo($0) })
            items.append(contentsOf: todos.map { .todo($0) })

            guard maxRows > 0 else { return [] }
            guard items.count > maxRows else { return items }
            // One slot is too small for a task plus more; keep one complete row.
            if maxRows == 1 {
                return Array(items.prefix(1))
            }
            let visible = Array(items.prefix(maxRows - 1))
            let remaining = items.count - visible.count
            return visible + [.more(remaining: remaining)]
        }

        struct TodoRow: Codable, Hashable, Identifiable, Sendable {
            var id: String
            var title: String
            var timeLabel: String
            var status: String

            enum CodingKeys: String, CodingKey {
                case id
                case title
                case timeLabel
                case status
            }

            init(id: String, title: String, timeLabel: String, status: String = "todo") {
                self.id = id
                self.title = title
                self.timeLabel = timeLabel
                self.status = status
            }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                id = try container.decode(String.self, forKey: .id)
                title = try container.decode(String.self, forKey: .title)
                timeLabel = try container.decode(String.self, forKey: .timeLabel)
                status = try container.decodeIfPresent(String.self, forKey: .status) ?? "todo"
            }
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
