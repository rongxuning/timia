import Foundation

/// Pure helpers for assembling lock-screen Live Activity content (unit-testable).
enum ScreenNotificationContentBuilder {
    static func isAllDay(startAt: String?, endAt: String?) -> Bool {
        guard let start = parseISO(startAt), let end = parseISO(endAt) else {
            return startAt == nil
        }
        return end.timeIntervalSince(start) >= 23 * 3600
    }

    static func isPendingTodo(status: String) -> Bool {
        status == "todo" || status == "doing"
    }

    static func allDayPendingTodos(from tasks: [ScheduleTask]) -> [ScheduleTask] {
        tasks.filter { isAllDay(startAt: $0.startAt, endAt: $0.endAt) && isPendingTodo(status: $0.status) }
    }

    static func todoTimeLabel(
        startAt: String?,
        endAt: String?,
        calendar: Calendar = .current,
        now: Date = Date()
    ) -> String {
        guard let start = parseISO(startAt) else { return "全天" }
        guard let end = parseISO(endAt) else {
            return isAllDay(startAt: startAt, endAt: endAt)
                ? "全天"
                : datedTimeRange(start: start, end: nil, calendar: calendar, now: now)
        }
        if end.timeIntervalSince(start) >= 23 * 3600 {
            if calendar.isDate(start, inSameDayAs: end.addingTimeInterval(-1)) {
                return "全天"
            }
            return "\(dayLabel(start, calendar: calendar)) – \(dayLabel(end.addingTimeInterval(-1), calendar: calendar))"
        }
        return datedTimeRange(start: start, end: end, calendar: calendar, now: now)
    }

    static func healthTimeLabel(lastSyncedAt: Date?, now: Date = Date()) -> String {
        guard let lastSyncedAt else { return "尚未同步" }
        let seconds = max(0, Int(now.timeIntervalSince(lastSyncedAt)))
        if seconds < 60 { return "刚刚" }
        if seconds < 3600 { return "\(seconds / 60)分钟前" }
        if seconds < 86_400 { return "\(seconds / 3600)小时前" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日 HH:mm"
        return formatter.string(from: lastSyncedAt)
    }

    static func makeContentState(
        healthEnabled: Bool,
        lastSyncedAt: Date?,
        todos: [ScheduleTask],
        overdue: [ScheduleTask] = [],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> TimiaScreenActivityAttributes.ContentState {
        let overdueTasks = mergedOverdue(dayTasks: todos, overdue: overdue, now: now, calendar: calendar)
        let overdueIds = Set(overdueTasks.map(\.id))
        let remaining = todos.filter { isPendingTodo(status: $0.status) && !overdueIds.contains($0.id) }

        let doing = remaining.filter { $0.status == "doing" && !isAllDay(startAt: $0.startAt, endAt: $0.endAt) }
        let notStarted = remaining.filter { $0.status == "todo" && !isAllDay(startAt: $0.startAt, endAt: $0.endAt) }
        let allDay = remaining.filter { isAllDay(startAt: $0.startAt, endAt: $0.endAt) }

        let healthVisible = healthEnabled
        return TimiaScreenActivityAttributes.ContentState(
            healthEnabled: healthVisible,
            healthTitle: "健康数据同步",
            healthTimeLabel: healthTimeLabel(lastSyncedAt: lastSyncedAt, now: now),
            todos: rows(from: allDay, calendar: calendar, now: now),
            workingCount: (healthVisible ? 1 : 0) + doing.count,
            doingTodos: rows(from: doing, calendar: calendar, now: now),
            notStartedTodos: rows(from: notStarted, calendar: calendar, now: now),
            overdueTodos: rows(from: overdueTasks, calendar: calendar, now: now)
        )
    }

    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    private static func mergedOverdue(
        dayTasks: [ScheduleTask],
        overdue: [ScheduleTask],
        now: Date,
        calendar: Calendar
    ) -> [ScheduleTask] {
        var seen = Set<String>()
        var merged: [ScheduleTask] = []
        for task in overdue where seen.insert(task.id).inserted {
            merged.append(task)
        }
        for task in dayTasks {
            guard isOverdue(task, now: now, calendar: calendar), seen.insert(task.id).inserted else { continue }
            merged.append(task)
        }
        return merged.sorted { lhs, rhs in
            let left = parseISO(lhs.endAt) ?? parseISO(lhs.startAt) ?? .distantFuture
            let right = parseISO(rhs.endAt) ?? parseISO(rhs.startAt) ?? .distantFuture
            if left != right { return left < right }
            return lhs.id < rhs.id
        }
    }

    private static func isOverdue(_ task: ScheduleTask, now: Date, calendar: Calendar) -> Bool {
        guard isPendingTodo(status: task.status) else { return false }
        guard let deadline = parseISO(task.endAt) ?? parseISO(task.startAt) else { return false }
        return calendar.startOfDay(for: deadline) < calendar.startOfDay(for: now)
    }

    private static func rows(
        from tasks: [ScheduleTask],
        calendar: Calendar,
        now: Date
    ) -> [TimiaScreenActivityAttributes.ContentState.TodoRow] {
        tasks.map { task in
            TimiaScreenActivityAttributes.ContentState.TodoRow(
                id: task.id,
                title: task.title,
                timeLabel: todoTimeLabel(startAt: task.startAt, endAt: task.endAt, calendar: calendar, now: now)
            )
        }
    }

    private static func datedTimeRange(start: Date, end: Date?, calendar: Calendar, now: Date) -> String {
        let startTime = timeOnly(start, calendar: calendar)
        let range: String
        if let end {
            range = "\(startTime) – \(timeOnly(end, calendar: calendar))"
        } else {
            range = startTime
        }
        if calendar.isDate(start, inSameDayAs: now) {
            return range
        }
        return "\(dayLabel(start, calendar: calendar)) \(range)"
    }

    private static func dayLabel(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "M月d日"
        return formatter.string(from: date)
    }

    private static func timeOnly(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private static func parseISO(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
