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

    static func todoTimeLabel(startAt: String?, endAt: String?, calendar: Calendar = .current) -> String {
        guard let start = parseISO(startAt) else { return "全天" }
        guard let end = parseISO(endAt) else {
            return isAllDay(startAt: startAt, endAt: endAt) ? "全天" : timeOnly(start)
        }
        if end.timeIntervalSince(start) >= 23 * 3600 {
            if calendar.isDate(start, inSameDayAs: end.addingTimeInterval(-1)) {
                return "全天"
            }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "zh_CN")
            formatter.dateFormat = "M月d日"
            return "\(formatter.string(from: start)) – \(formatter.string(from: end.addingTimeInterval(-1)))"
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm"
        return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
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
        now: Date = Date()
    ) -> TimiaScreenActivityAttributes.ContentState {
        let rows = allDayPendingTodos(from: todos).map { task in
            TimiaScreenActivityAttributes.ContentState.TodoRow(
                id: task.id,
                title: task.title,
                timeLabel: todoTimeLabel(startAt: task.startAt, endAt: task.endAt)
            )
        }
        let healthVisible = healthEnabled
        let workingCount = (healthVisible ? 1 : 0) + rows.count
        return TimiaScreenActivityAttributes.ContentState(
            healthEnabled: healthVisible,
            healthTitle: "健康数据同步",
            healthTimeLabel: healthTimeLabel(lastSyncedAt: lastSyncedAt, now: now),
            todos: rows,
            workingCount: workingCount
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

    private static func timeOnly(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
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
