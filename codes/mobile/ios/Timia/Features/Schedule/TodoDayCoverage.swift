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

func todoDaySectionPaging(
    visibleDayCount: Int,
    apiHasMore: Bool,
    isLoading: Bool
) -> TodoDaySectionPaging {
    TodoDaySectionPaging(
        showsLoadMore: apiHasMore && visibleDayCount > 0,
        remainingCount: 0,
        shouldAutoLoadMore: apiHasMore && visibleDayCount == 0 && !isLoading
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

private func parseTodoScheduleISO(_ value: String?) -> Date? {
    guard let value else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}
