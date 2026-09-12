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

    func testRevealPagesStripBySevenDaysWhenDateLeavesTheEnd() {
        // Strip 10–16; leave on 17 → adjacent cycle 17–23.
        let start = date(2026, 9, 10)
        let revealed = dateStripStartByRevealing(date(2026, 9, 17), currentStart: start, calendar: calendar)

        XCTAssertEqual(dayKey(revealed), "2026-09-17")
        XCTAssertEqual(
            dateStripDays(starting: revealed, calendar: calendar).map(dayKey),
            [
                "2026-09-17",
                "2026-09-18",
                "2026-09-19",
                "2026-09-20",
                "2026-09-21",
                "2026-09-22",
                "2026-09-23",
            ]
        )
    }

    func testRevealPagesStripBySevenDaysWhenDateLeavesTheStart() {
        // Strip 10–16; leave on 9 → adjacent cycle 3–9.
        let start = date(2026, 9, 10)
        let revealed = dateStripStartByRevealing(date(2026, 9, 9), currentStart: start, calendar: calendar)

        XCTAssertEqual(dayKey(revealed), "2026-09-03")
        XCTAssertEqual(
            dateStripDays(starting: revealed, calendar: calendar).map(dayKey),
            [
                "2026-09-03",
                "2026-09-04",
                "2026-09-05",
                "2026-09-06",
                "2026-09-07",
                "2026-09-08",
                "2026-09-09",
            ]
        )
    }

    func testRevealPagesMultipleCyclesWhenDateJumpsFarPastRange() {
        let start = date(2026, 9, 10)
        let forward = dateStripStartByRevealing(date(2026, 9, 24), currentStart: start, calendar: calendar)
        let backward = dateStripStartByRevealing(date(2026, 9, 2), currentStart: start, calendar: calendar)

        XCTAssertEqual(dayKey(forward), "2026-09-24")
        XCTAssertEqual(dayKey(backward), "2026-08-27")
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

    func testDateStripScrollOffsetsAreSymmetricAroundZero() {
        XCTAssertEqual(dateStripScrollOffsets(radius: 2), [-2, -1, 0, 1, 2])
    }

    func testDateStripDayKeysCoverConsecutiveDaysAroundOrigin() {
        let keys = dateStripDayKeys(origin: date(2026, 9, 10), radius: 2, calendar: calendar)

        XCTAssertEqual(keys, [
            "2026-09-08",
            "2026-09-09",
            "2026-09-10",
            "2026-09-11",
            "2026-09-12",
        ])
    }

    func testDateStripNeedsReanchorNearGeneratedEdge() {
        let origin = date(2026, 9, 10)
        // radius 10, edgePadding 3 → reanchor when |delta| > 7
        XCTAssertFalse(
            dateStripNeedsReanchor(
                visibleStart: date(2026, 9, 16),
                origin: origin,
                radius: 10,
                edgePadding: 3,
                calendar: calendar
            )
        )
        XCTAssertTrue(
            dateStripNeedsReanchor(
                visibleStart: date(2026, 9, 18),
                origin: origin,
                radius: 10,
                edgePadding: 3,
                calendar: calendar
            )
        )
    }

    func testDateStripDayStepsScalesWithTranslationAndDayWidth() {
        XCTAssertEqual(dateStripDaySteps(translationWidth: -44, dayWidth: 44), 1)
        XCTAssertEqual(dateStripDaySteps(translationWidth: -130, dayWidth: 44), 3)
        XCTAssertEqual(dateStripDaySteps(translationWidth: 88, dayWidth: 44), -2)
        XCTAssertEqual(dateStripDaySteps(translationWidth: -10, dayWidth: 44), 0)
        XCTAssertEqual(dateStripDaySteps(translationWidth: -100, dayWidth: 0), 0)
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
