import XCTest
@testable import Timia

final class CalendarWeekTitleTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.firstWeekday = 1
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }

    func testUsesSingleMonthWhenWeekStaysInsideIt() {
        let days = weekDays(containing: date(2026, 8, 17))

        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(dominantMonthTitle(for: days, calendar: calendar), "2026年08月")
    }

    func testUsesMonthWithMoreVisibleDaysWhenWeekCrossesBoundary() {
        // Sunday 2026-08-30 ... Saturday 2026-09-05: August 2 days, September 5.
        let days = weekDays(containing: date(2026, 8, 30))

        XCTAssertEqual(dayKey(days.first), "2026-08-30")
        XCTAssertEqual(dayKey(days.last), "2026-09-05")
        XCTAssertEqual(dominantMonthTitle(for: days, calendar: calendar), "2026年09月")
    }

    func testUsesLaterMonthWhenItHasMoreDaysEvenIfSelectedDayIsEarlierMonth() {
        // Sunday 2026-05-31 ... Saturday 2026-06-06: May 1 day, June 6.
        let days = weekDays(containing: date(2026, 5, 31))

        XCTAssertEqual(dominantMonthTitle(for: days, calendar: calendar), "2026年06月")
    }

    func testStripDaysAreSevenConsecutiveDaysFromStart() {
        let days = dateStripDays(starting: date(2026, 8, 17), calendar: calendar)

        XCTAssertEqual(days.map(dayKey), [
            "2026-08-17",
            "2026-08-18",
            "2026-08-19",
            "2026-08-20",
            "2026-08-21",
            "2026-08-22",
            "2026-08-23",
        ])
    }

    func testShiftingStripByOneDayMovesVisibleWindowOnly() {
        let start = date(2026, 8, 16)
        let next = dateStripDays(starting: dateByAddingDays(1, to: start, calendar: calendar), calendar: calendar)
        let previous = dateStripDays(starting: dateByAddingDays(-1, to: start, calendar: calendar), calendar: calendar)

        XCTAssertEqual(dayKey(next.first), "2026-08-17")
        XCTAssertEqual(dayKey(next.last), "2026-08-23")
        XCTAssertEqual(dayKey(previous.first), "2026-08-15")
        XCTAssertEqual(dayKey(previous.last), "2026-08-21")
    }

    func testDominantMonthFollowsVisibleStripDaysNotWeekAlignment() {
        let augustMajority = dateStripDays(starting: date(2026, 8, 28), calendar: calendar)
        let septemberMajority = dateStripDays(starting: date(2026, 8, 29), calendar: calendar)

        XCTAssertEqual(dominantMonthTitle(for: augustMajority, calendar: calendar), "2026年08月")
        XCTAssertEqual(dominantMonthTitle(for: septemberMajority, calendar: calendar), "2026年09月")
    }

    func testDateFromDayKeyRoundTripsLocalCalendarDate() {
        let parsed = dateFromDayKey("2026-08-17", calendar: calendar)

        XCTAssertEqual(dayKey(parsed), "2026-08-17")
    }

    func testRevealKeepsStripStartWhenDateIsAlreadyVisible() {
        let start = date(2026, 8, 16)
        let revealed = dateStripStartByRevealing(date(2026, 8, 19), currentStart: start, calendar: calendar)

        XCTAssertEqual(dayKey(revealed), "2026-08-16")
    }

    func testRevealShiftsStripByOneDayWhenDateLeavesTheEnd() {
        let start = date(2026, 8, 16)
        let revealed = dateStripStartByRevealing(date(2026, 8, 23), currentStart: start, calendar: calendar)

        XCTAssertEqual(dayKey(revealed), "2026-08-17")
        XCTAssertEqual(dayKey(dateStripDays(starting: revealed, calendar: calendar).last), "2026-08-23")
    }

    func testRevealShiftsStripByOneDayWhenDateLeavesTheStart() {
        let start = date(2026, 8, 16)
        let revealed = dateStripStartByRevealing(date(2026, 8, 15), currentStart: start, calendar: calendar)

        XCTAssertEqual(dayKey(revealed), "2026-08-15")
        XCTAssertEqual(dayKey(dateStripDays(starting: revealed, calendar: calendar).last), "2026-08-21")
    }

    func testWeekStripStartSnapsToSundayContainingDate() {
        XCTAssertEqual(dayKey(dateStripStartForWeek(containing: date(2026, 8, 17), calendar: calendar)), "2026-08-16")
        XCTAssertEqual(dayKey(dateStripStartForWeek(containing: date(2026, 8, 16), calendar: calendar)), "2026-08-16")
    }

    func testShiftingStripByOneWeekMovesWindowBySevenDays() {
        let start = date(2026, 8, 16)
        let next = dateByAddingDays(7, to: start, calendar: calendar)
        let previous = dateByAddingDays(-7, to: start, calendar: calendar)

        XCTAssertEqual(dateStripDays(starting: next, calendar: calendar).map(dayKey), [
            "2026-08-23",
            "2026-08-24",
            "2026-08-25",
            "2026-08-26",
            "2026-08-27",
            "2026-08-28",
            "2026-08-29",
        ])
        XCTAssertEqual(dayKey(previous), "2026-08-09")
    }

    func testWeekShiftUpdatesDominantMonthWhenMoreDaysMoveIntoNextMonth() {
        let augustWeek = date(2026, 8, 23)
        let septemberWeek = dateByAddingDays(7, to: augustWeek, calendar: calendar)

        XCTAssertEqual(
            dominantMonthTitle(for: dateStripDays(starting: augustWeek, calendar: calendar), calendar: calendar),
            "2026年08月"
        )
        XCTAssertEqual(
            dominantMonthTitle(for: dateStripDays(starting: septemberWeek, calendar: calendar), calendar: calendar),
            "2026年09月"
        )
    }

    func testWeekStripChangeDoesNotRetargetTimelineWhenAlreadyShowingThatWeek() {
        let sunday = date(2026, 8, 16)
        let wednesday = date(2026, 8, 19)

        XCTAssertNil(weekTimelineTarget(stripStart: sunday, displayedDate: wednesday, calendar: calendar))
        XCTAssertNil(weekTimelineTarget(stripStart: sunday, displayedDate: sunday, calendar: calendar))
    }

    func testWeekStripChangeTargetsTimelineWeekWhenHeaderPagesToAnotherWeek() {
        let displayed = date(2026, 8, 17)
        let nextSunday = date(2026, 8, 23)
        let previousSunday = date(2026, 8, 9)

        XCTAssertEqual(
            dayKey(weekTimelineTarget(stripStart: nextSunday, displayedDate: displayed, calendar: calendar)),
            "2026-08-23"
        )
        XCTAssertEqual(
            dayKey(weekTimelineTarget(stripStart: previousSunday, displayedDate: displayed, calendar: calendar)),
            "2026-08-09"
        )
    }

    private func weekDays(containing date: Date) -> [Date] {
        weekDaysContaining(date, calendar: calendar)
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    private func dayKey(_ date: Date?) -> String {
        guard let date else { return "" }
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }
}
