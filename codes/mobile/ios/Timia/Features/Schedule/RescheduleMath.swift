import Foundation

enum RescheduleMath {
    /// Rounds minute-of-day to the nearest hour (half-hour rounds up).
    static func snapToHour(_ minutes: Int) -> Int {
        ((minutes + 30) / 60) * 60
    }

    static func computeNewRange(
        originalStart: Date,
        originalEnd: Date?,
        dropDay: Date,
        dropMinutes: Int,
        calendar: Calendar
    ) -> (start: Date, end: Date) {
        let duration = originalEnd.map { $0.timeIntervalSince(originalStart) } ?? 3600
        let day = calendar.dateComponents([.year, .month, .day], from: dropDay)
        var components = DateComponents()
        components.year = day.year
        components.month = day.month
        components.day = day.day
        components.hour = dropMinutes / 60
        components.minute = dropMinutes % 60
        components.second = 0
        let start = calendar.date(from: components)!
        let end = start.addingTimeInterval(duration)
        return (start, end)
    }

    /// Matches TaskEditor / ScheduleFormat ISO output (no fractional seconds).
    static func iso8601(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
