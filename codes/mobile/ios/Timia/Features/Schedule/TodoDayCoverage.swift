import Foundation

func taskCoversLocalDay(
    _ task: ScheduleTask,
    on date: Date,
    calendar: Calendar = .current
) -> Bool {
    guard let interval = calendar.dateInterval(of: .day, for: date) else { return false }
    let parsedStart = parseTodoScheduleISO(task.startAt)
    let parsedEnd = parseTodoScheduleISO(task.endAt)
    guard let start = parsedStart ?? parsedEnd else { return false }
    let end = parsedEnd ?? parsedStart ?? start

    if end > start {
        return start < interval.end && end > interval.start
    }
    return interval.contains(start)
}

func filterTodoColumnsCoveringLocalDay(
    _ columns: [String: [ScheduleTask]],
    date: Date,
    calendar: Calendar = .current
) -> [String: [ScheduleTask]] {
    Dictionary(uniqueKeysWithValues: columns.map { status, tasks in
        (status, tasks.filter { taskCoversLocalDay($0, on: date, calendar: calendar) })
    })
}

struct TodoDaySectionPaging: Equatable {
    let showsLoadMore: Bool
    let remainingCount: Int
    let shouldAutoLoadMore: Bool
}

let todoSectionPageSize = 5

func todoSectionDisplayedCount(visibleDayCount: Int, revealedCount: Int) -> Int {
    min(max(revealedCount, 0), max(visibleDayCount, 0))
}

func todoDaySectionPaging(
    visibleDayCount: Int,
    apiHasMore: Bool,
    isLoading: Bool,
    revealedCount: Int = todoSectionPageSize
) -> TodoDaySectionPaging {
    _ = isLoading
    let displayedCount = todoSectionDisplayedCount(
        visibleDayCount: visibleDayCount,
        revealedCount: revealedCount
    )
    let hasUnrevealed = visibleDayCount > displayedCount
    let filledPage = displayedCount >= todoSectionPageSize
    return TodoDaySectionPaging(
        showsLoadMore: hasUnrevealed || (filledPage && apiHasMore),
        remainingCount: 0,
        shouldAutoLoadMore: false
    )
}

func isTodoTaskOverdue(
    _ task: ScheduleTask,
    now: Date = Date(),
    calendar: Calendar = .current
) -> Bool {
    guard task.status == "todo" || task.status == "doing" else { return false }
    guard let deadline = parseTodoScheduleISO(task.endAt) ?? parseTodoScheduleISO(task.startAt) else {
        return false
    }
    return calendar.startOfDay(for: deadline) < calendar.startOfDay(for: now)
}

func listOverdueTodoTasks(
    from columns: [String: [ScheduleTask]],
    now: Date = Date(),
    calendar: Calendar = .current
) -> [ScheduleTask] {
    let tasks = (columns["todo"] ?? []) + (columns["doing"] ?? [])
    return tasks
        .filter { isTodoTaskOverdue($0, now: now, calendar: calendar) }
        .sorted { lhs, rhs in
            let left = parseTodoScheduleISO(lhs.endAt) ?? parseTodoScheduleISO(lhs.startAt) ?? .distantFuture
            let right = parseTodoScheduleISO(rhs.endAt) ?? parseTodoScheduleISO(rhs.startAt) ?? .distantFuture
            if left != right { return left < right }
            return lhs.id < rhs.id
        }
}

let todoScheduleSectionOrder = ["todo", "doing", "done", "overdue", "future", "undated", "archived"]

func isTodoTaskUndated(_ task: ScheduleTask) -> Bool {
    task.startAt == nil && task.endAt == nil
}

func listUndatedTodoTasks(from columns: [String: [ScheduleTask]]) -> [ScheduleTask] {
    let tasks = (columns["todo"] ?? []) + (columns["doing"] ?? [])
    return tasks
        .filter(isTodoTaskUndated)
        .sorted { $0.id < $1.id }
}

enum TodoPeopleFilter: String, CaseIterable, Identifiable {
    case assignee
    case participant
    case all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .assignee: "本人负责"
        case .participant: "本人参与"
        case .all: "全部"
        }
    }

    var involvementQueryValue: String {
        switch self {
        case .assignee: "assignee"
        case .participant: "participant"
        case .all: "any"
        }
    }
}

func isTodoTaskFuture(
    _ task: ScheduleTask,
    now: Date = Date(),
    calendar: Calendar = .current
) -> Bool {
    guard task.status == "todo" || task.status == "doing" else { return false }
    guard let start = parseTodoScheduleISO(task.startAt) ?? parseTodoScheduleISO(task.endAt) else {
        return false
    }
    return calendar.startOfDay(for: start) > calendar.startOfDay(for: now)
}

func listFutureTodoTasks(
    from columns: [String: [ScheduleTask]],
    now: Date = Date(),
    calendar: Calendar = .current
) -> [ScheduleTask] {
    let tasks = (columns["todo"] ?? []) + (columns["doing"] ?? [])
    return tasks
        .filter { isTodoTaskFuture($0, now: now, calendar: calendar) }
        .sorted { lhs, rhs in
            let left = parseTodoScheduleISO(lhs.startAt) ?? parseTodoScheduleISO(lhs.endAt) ?? .distantFuture
            let right = parseTodoScheduleISO(rhs.startAt) ?? parseTodoScheduleISO(rhs.endAt) ?? .distantFuture
            if left != right { return left < right }
            return lhs.id < rhs.id
        }
}

func taskMatchesTodoPeopleFilter(
    _ task: ScheduleTask,
    userId: String,
    filter: TodoPeopleFilter
) -> Bool {
    switch filter {
    case .assignee:
        return task.assignee?.id == userId
    case .participant:
        return (task.participants ?? []).contains { $0.id == userId }
    case .all:
        return task.createdBy?.id == userId
            || task.assignee?.id == userId
            || (task.participants ?? []).contains { $0.id == userId }
    }
}

func filterTodoTasks(
    _ tasks: [ScheduleTask],
    userId: String,
    peopleFilter: TodoPeopleFilter
) -> [ScheduleTask] {
    tasks.filter { taskMatchesTodoPeopleFilter($0, userId: userId, filter: peopleFilter) }
}

func todoDateByHorizontalSwipe(
    from date: Date,
    translation: CGSize,
    calendar: Calendar = .current,
    minimumDistance: CGFloat = 56,
    horizontalIntentRatio: CGFloat = 1.25
) -> Date? {
    guard abs(translation.width) >= minimumDistance,
          abs(translation.width) > abs(translation.height) * horizontalIntentRatio else {
        return nil
    }
    let delta = translation.width < 0 ? 1 : -1
    return calendar.date(byAdding: .day, value: delta, to: calendar.startOfDay(for: date))
}

private func parseTodoScheduleISO(_ value: String?) -> Date? {
    guard let value else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}
