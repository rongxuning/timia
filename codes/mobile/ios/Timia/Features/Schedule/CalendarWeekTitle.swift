import CoreGraphics
import Foundation

enum WeekStartDay {
    static let monday = 1
    static let saturday = 6
    static let sunday = 7

    static func normalized(_ value: Int?) -> Int {
        switch value {
        case saturday, sunday, monday:
            return value ?? monday
        default:
            return monday
        }
    }

    /// Apple `Calendar.firstWeekday`: 1 = Sunday … 7 = Saturday.
    static func appleFirstWeekday(_ startsOn: Int) -> Int {
        switch normalized(startsOn) {
        case monday: return 2
        case saturday: return 7
        default: return 1
        }
    }
}

enum TimiaWeekCalendar {
    nonisolated(unsafe) static var startsOn: Int = WeekStartDay.monday

    static func adopt(_ startsOn: Int) {
        self.startsOn = WeekStartDay.normalized(startsOn)
    }

    static func calendar(timeZone: TimeZone = .current) -> Calendar {
        timiaCalendar(weekStartsOn: startsOn, timeZone: timeZone)
    }
}

func timiaCalendar(weekStartsOn: Int, timeZone: TimeZone = .current) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = Locale(identifier: "en_US_POSIX")
    calendar.timeZone = timeZone
    calendar.firstWeekday = WeekStartDay.appleFirstWeekday(weekStartsOn)
    return calendar
}

func weekdayHeaderLabels(weekStartsOn: Int = TimiaWeekCalendar.startsOn) -> [String] {
    let labels = ["一", "二", "三", "四", "五", "六", "日"]
    let startIndex = WeekStartDay.normalized(weekStartsOn) - 1
    return (0..<7).map { labels[(startIndex + $0) % 7] }
}

func leadingWeekdayBlanks(for date: Date, calendar: Calendar) -> Int {
    let weekday = calendar.component(.weekday, from: date)
    return (weekday - calendar.firstWeekday + 7) % 7
}

func weekDaysContaining(_ date: Date, calendar: Calendar = TimiaWeekCalendar.calendar()) -> [Date] {
    let day = calendar.startOfDay(for: date)
    let start = calendar.date(
        byAdding: .day,
        value: -leadingWeekdayBlanks(for: day, calendar: calendar),
        to: day
    ) ?? day
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
    calendar: Calendar = TimiaWeekCalendar.calendar()
) -> [String] {
    // Account week calendar + exact 7-day steps so selectedWeekKey stays in pageKeys.
    let weekStart = dateStripStartForWeek(containing: origin, calendar: calendar)
    return offsets.map { offset in
        let date = dateByAddingDays(offset * 7, to: weekStart, calendar: calendar)
        return calendarDayKey(date, calendar: calendar)
    }
}

/// Week the next horizontal swipe is measured from.
///
/// After a swipe settles, `origin` becomes that visible week. The following
/// swipe is then exactly one week earlier or later. Leaving the origin on the
/// week where paging started makes the next gesture apply its delta again.
struct WeekPagingAnchor: Equatable {
    var origin: Date

    init(weekContaining date: Date, calendar: Calendar) {
        origin = dateStripStartForWeek(containing: date, calendar: calendar)
    }

    mutating func settle(on visible: Date, calendar: Calendar) {
        origin = weekPagingOrigin(currentOrigin: origin, visibleWeek: visible, calendar: calendar)
    }

    func neighbor(direction: Int, calendar: Calendar) -> Date {
        dateByAddingDays(direction * 7, to: origin, calendar: calendar)
    }

    func pageKeys(
        offsets: ClosedRange<Int> = CalendarInfiniteWindow.weekOffsets,
        calendar: Calendar
    ) -> [String] {
        timelinePageWeekKeys(origin: origin, offsets: offsets, calendar: calendar)
    }
}

func weekPagingOrigin(
    currentOrigin: Date,
    visibleWeek: Date,
    calendar: Calendar = TimiaWeekCalendar.calendar()
) -> Date {
    let visible = dateStripStartForWeek(containing: visibleWeek, calendar: calendar)
    let origin = dateStripStartForWeek(containing: currentOrigin, calendar: calendar)
    if calendar.isDate(visible, inSameDayAs: origin) {
        return origin
    }
    return visible
}

enum WeekPageReport: Equatable {
    /// Reported week is the current base.
    case unchanged
    /// Move exactly one week from the current base. A two-week report is the
    /// extra page applied on top of a swipe, so it collapses to one step.
    case step(String)
    /// Not a single swipe (layout reset, stale origin). Stay on the current week.
    case resetTo(String)
}

func classifyWeekPageReport(
    currentKey: String,
    reportedKey: String,
    calendar: Calendar = TimiaWeekCalendar.calendar()
) -> WeekPageReport {
    if currentKey == reportedKey { return .unchanged }
    guard let current = dateFromDayKey(currentKey, calendar: calendar),
          let reported = dateFromDayKey(reportedKey, calendar: calendar) else {
        return .resetTo(currentKey)
    }
    let from = dateStripStartForWeek(containing: current, calendar: calendar)
    let to = dateStripStartForWeek(containing: reported, calendar: calendar)
    let days = calendar.dateComponents([.day], from: from, to: to).day ?? 0
    guard days != 0, days.isMultiple(of: 7) else { return .resetTo(currentKey) }
    let steps = days / 7
    if abs(steps) == 1 {
        return .step(calendarDayKey(to, calendar: calendar))
    }
    if abs(steps) == 2 {
        let oneStep = dateByAddingDays((steps > 0 ? 1 : -1) * 7, to: from, calendar: calendar)
        return .step(calendarDayKey(oneStep, calendar: calendar))
    }
    return .resetTo(currentKey)
}

/// Scroll the week header only when it is not already on the requested week.
/// A finger swipe has already paged there; scrolling again adds a second week.
func weekHeaderNeedsProgrammaticScroll(
    visibleStart: Date,
    positionedStart: Date?,
    calendar: Calendar = TimiaWeekCalendar.calendar()
) -> Bool {
    let visible = dateStripStartForWeek(containing: visibleStart, calendar: calendar)
    guard let positionedStart else { return true }
    let positioned = dateStripStartForWeek(containing: positionedStart, calendar: calendar)
    return !calendar.isDate(visible, inSameDayAs: positioned)
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
