import CoreGraphics
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

func dateStripDayDelta(
    from: Date,
    to: Date,
    calendar: Calendar = .current
) -> Int {
    calendar.dateComponents(
        [.day],
        from: calendar.startOfDay(for: from),
        to: calendar.startOfDay(for: to)
    ).day ?? 0
}

/// Ignore in-flight per-day scroll reports while the strip pages by a whole week.
func dateStripShouldIgnoreScrollReporting(
    from: Date,
    to: Date,
    calendar: Calendar = .current
) -> Bool {
    abs(dateStripDayDelta(from: from, to: to, calendar: calendar)) >= 7
}

func dateByPreservingWeekday(
    from selected: Date,
    intoWeekContaining target: Date,
    calendar: Calendar = .current
) -> Date {
    let selectedWeek = weekDaysContaining(selected, calendar: calendar)
    let targetWeek = weekDaysContaining(target, calendar: calendar)
    guard let index = selectedWeek.firstIndex(where: { calendar.isDate($0, inSameDayAs: selected) }),
          targetWeek.indices.contains(index) else {
        return targetWeek.first ?? calendar.startOfDay(for: target)
    }
    return targetWeek[index]
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
        calendarDayKey(dateStripDate(offset: offset, origin: origin, calendar: calendar), calendar: calendar)
    }
}

func calendarDayKey(_ date: Date, calendar: Calendar = .current) -> String {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return String(
        format: "%04d-%02d-%02d",
        components.year ?? 0,
        components.month ?? 0,
        components.day ?? 0
    )
}

func timelinePageDayKeys(
    origin: Date,
    offsets: ClosedRange<Int> = CalendarInfiniteWindow.dayOffsets,
    calendar: Calendar = .current
) -> [String] {
    let origin = calendar.startOfDay(for: origin)
    return offsets.map { offset in
        let date = calendar.date(byAdding: .day, value: offset, to: origin) ?? origin
        return calendarDayKey(date, calendar: calendar)
    }
}

func timelinePageWeekKeys(
    origin: Date,
    offsets: ClosedRange<Int> = CalendarInfiniteWindow.weekOffsets,
    calendar: Calendar = .current
) -> [String] {
    let weekStart = dateStripStartForWeek(containing: origin, calendar: calendar)
    return offsets.map { offset in
        let date = calendar.date(byAdding: .weekOfYear, value: offset, to: weekStart) ?? weekStart
        return calendarDayKey(date, calendar: calendar)
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

func dateStripNeedsForcedRevealScroll(
    from oldStart: Date,
    to newStart: Date,
    calendar: Calendar = .current
) -> Bool {
    dateStripShouldIgnoreScrollReporting(from: oldStart, to: newStart, calendar: calendar)
}

/// Drop stale leading-day reports while a programmatic week jump is still settling.
///
/// `visibleStart` is updated by the parent before `ScrollView` lands. During that
/// window the scroll view may report an intermediate leading day (for example 15
/// while jumping 14 → 21). Those writes must not clobber the jump.
func dateStripShouldCommitScrolledStart(
    proposedStart: Date,
    visibleStart: Date,
    settledStart: Date,
    jumpTarget: Date? = nil,
    calendar: Calendar = .current
) -> Bool {
    let proposed = calendar.startOfDay(for: proposedStart)
    let visible = calendar.startOfDay(for: visibleStart)
    let settled = calendar.startOfDay(for: settledStart)
    guard !calendar.isDate(proposed, inSameDayAs: visible) else { return false }

    let inFlightTarget = jumpTarget.map { calendar.startOfDay(for: $0) }
        ?? (dateStripNeedsForcedRevealScroll(from: settled, to: visible, calendar: calendar) ? visible : nil)
    if let target = inFlightTarget {
        return calendar.isDate(proposed, inSameDayAs: target)
    }
    // Parent already moved (reveal) but the jump is shorter than a week, or GET
    // ran before onChange assigned jumpTarget: do not walk the leading edge back.
    if !calendar.isDate(visible, inSameDayAs: settled) {
        return false
    }
    return true
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
