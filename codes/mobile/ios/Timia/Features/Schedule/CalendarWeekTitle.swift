import Foundation

func weekDaysContaining(_ date: Date, calendar: Calendar = .current) -> [Date] {
    let weekday = calendar.component(.weekday, from: date)
    let start = calendar.date(
        byAdding: .day,
        value: -(weekday - 1),
        to: calendar.startOfDay(for: date)
    ) ?? date
    return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
}

func dateByAddingDays(_ days: Int, to date: Date, calendar: Calendar = .current) -> Date {
    calendar.date(byAdding: .day, value: days, to: date) ?? date
}

func dateFromDayKey(_ key: String, calendar: Calendar = .current) -> Date? {
    let parts = key.split(separator: "-")
    guard parts.count == 3,
          let year = Int(parts[0]),
          let month = Int(parts[1]),
          let day = Int(parts[2]) else { return nil }
    return calendar.date(from: DateComponents(year: year, month: month, day: day))
}

func dateStripDays(starting start: Date, count: Int = 7, calendar: Calendar = .current) -> [Date] {
    let start = calendar.startOfDay(for: start)
    return (0..<count).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
}

func dateStripStartByRevealing(
    _ date: Date,
    currentStart: Date,
    calendar: Calendar = .current
) -> Date {
    let start = calendar.startOfDay(for: currentStart)
    let target = calendar.startOfDay(for: date)
    if dateStripDays(starting: start, calendar: calendar).contains(where: {
        calendar.isDate($0, inSameDayAs: target)
    }) {
        return start
    }
    if target < start {
        return target
    }
    return dateByAddingDays(-6, to: target, calendar: calendar)
}

func dateStripStartForWeek(containing date: Date, calendar: Calendar = .current) -> Date {
    weekDaysContaining(date, calendar: calendar).first ?? calendar.startOfDay(for: date)
}

func weekTimelineTarget(
    stripStart: Date,
    displayedDate: Date,
    calendar: Calendar = .current
) -> Date? {
    let stripWeek = dateStripStartForWeek(containing: stripStart, calendar: calendar)
    let displayedWeek = dateStripStartForWeek(containing: displayedDate, calendar: calendar)
    guard !calendar.isDate(stripWeek, inSameDayAs: displayedWeek) else { return nil }
    return stripWeek
}

func dominantMonthTitle(for days: [Date], calendar: Calendar = .current) -> String {
    var counts: [String: (count: Int, year: Int, month: Int)] = [:]
    for day in days {
        let components = calendar.dateComponents([.year, .month], from: day)
        let year = components.year ?? 0
        let month = components.month ?? 0
        let key = String(format: "%04d-%02d", year, month)
        if let existing = counts[key] {
            counts[key] = (existing.count + 1, year, month)
        } else {
            counts[key] = (1, year, month)
        }
    }
    guard let winner = counts.max(by: { lhs, rhs in
        if lhs.value.count != rhs.value.count {
            return lhs.value.count < rhs.value.count
        }
        return lhs.key < rhs.key
    }) else {
        return ""
    }
    return String(format: "%04d年%02d月", winner.value.year, winner.value.month)
}
