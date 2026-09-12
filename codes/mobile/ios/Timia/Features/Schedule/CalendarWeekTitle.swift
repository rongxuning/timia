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
    // Page by adjacent 7-day cycles relative to the current strip start.
    // Example: strip 10–16, scroll to 17 → start becomes 17 (17–23).
    let dayDelta = calendar.dateComponents([.day], from: start, to: target).day ?? 0
    let cycles = dayDelta >= 0 ? dayDelta / 7 : (dayDelta - 6) / 7
    return dateByAddingDays(cycles * 7, to: start, calendar: calendar)
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

/// Horizontal day-strip scroll window: day offsets centered on `origin`.
func dateStripScrollOffsets(radius: Int = 180) -> [Int] {
    Array(-radius...radius)
}

func dateStripDate(offset: Int, origin: Date, calendar: Calendar = .current) -> Date {
    dateByAddingDays(offset, to: calendar.startOfDay(for: origin), calendar: calendar)
}

func dateStripDayKeys(origin: Date, radius: Int = 180, calendar: Calendar = .current) -> [String] {
    dateStripScrollOffsets(radius: radius).map { offset in
        let date = dateStripDate(offset: offset, origin: origin, calendar: calendar)
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }
}

/// Re-center the strip catalog when `visibleStart` approaches the edge of the generated range.
func dateStripNeedsReanchor(
    visibleStart: Date,
    origin: Date,
    radius: Int = 180,
    edgePadding: Int = 30,
    calendar: Calendar = .current
) -> Bool {
    let start = calendar.startOfDay(for: visibleStart)
    let originDay = calendar.startOfDay(for: origin)
    let delta = abs(calendar.dateComponents([.day], from: originDay, to: start).day ?? 0)
    return delta > radius - edgePadding
}

/// How many whole days a finger translation should move the strip (left = later dates).
func dateStripDaySteps(translationWidth: CGFloat, dayWidth: CGFloat) -> Int {
    guard dayWidth > 0 else { return 0 }
    return Int((-translationWidth / dayWidth).rounded())
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
