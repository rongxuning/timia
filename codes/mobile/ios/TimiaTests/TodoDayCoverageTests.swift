import XCTest
@testable import Timia

final class TodoDayCoverageTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }

    func testIncludesTaskFullyInsideSelectedLocalDay() {
        let day = date(2026, 8, 17)
        let task = task(
            id: "inside",
            startAt: "2026-08-17T02:00:00Z",
            endAt: "2026-08-17T04:00:00Z"
        )

        XCTAssertTrue(taskCoversLocalDay(task, on: day, calendar: calendar))
    }

    func testIncludesOvernightTaskThatCrossesSelectedLocalDay() {
        let day = date(2026, 8, 17)
        let task = task(
            id: "overnight",
            startAt: "2026-08-16T15:30:00Z",
            endAt: "2026-08-16T17:30:00Z"
        )

        XCTAssertTrue(taskCoversLocalDay(task, on: day, calendar: calendar))
        XCTAssertTrue(taskCoversLocalDay(task, on: date(2026, 8, 16), calendar: calendar))
    }

    func testExcludesTaskOnAdjacentLocalDay() {
        let day = date(2026, 8, 17)
        let task = task(
            id: "adjacent",
            startAt: "2026-08-16T02:00:00Z",
            endAt: "2026-08-16T03:00:00Z"
        )

        XCTAssertFalse(taskCoversLocalDay(task, on: day, calendar: calendar))
    }

    func testIncludesStartOnlyTaskOnSelectedLocalDay() {
        let day = date(2026, 8, 17)
        let task = task(id: "start-only", startAt: "2026-08-17T10:00:00Z", endAt: nil)

        XCTAssertTrue(taskCoversLocalDay(task, on: day, calendar: calendar))
        XCTAssertFalse(taskCoversLocalDay(task, on: date(2026, 8, 18), calendar: calendar))
    }

    func testDateStripMarkedDayKeysIncludesOnlyDaysWithTasks() {
        let months = [
            CalendarMonthSummary(
                month: 9,
                taskCount: 2,
                todoCount: 1,
                doneCount: 1,
                days: [
                    CalendarHeatDay(key: "2026-09-29", taskCount: 0),
                    CalendarHeatDay(key: "2026-09-30", taskCount: 2),
                    CalendarHeatDay(key: "2026-10-01", taskCount: 1)
                ]
            )
        ]

        XCTAssertEqual(
            dateStripMarkedDayKeys(from: months),
            Set(["2026-09-30", "2026-10-01"])
        )
    }

    func testDateStripMarkedDayKeysIsEmptyWhenNoTasks() {
        let months = [
            CalendarMonthSummary(
                month: 9,
                taskCount: 0,
                todoCount: 0,
                doneCount: 0,
                days: [
                    CalendarHeatDay(key: "2026-09-30", taskCount: 0)
                ]
            )
        ]

        XCTAssertTrue(dateStripMarkedDayKeys(from: months).isEmpty)
    }

    func testTodoDateStripYearsPrefetchIncludesStripAndSelectedYears() {
        let stripStart = date(2025, 12, 28)
        let selected = date(2026, 1, 2)

        XCTAssertEqual(
            todoDateStripYearsToPrefetch(around: stripStart, selectedDate: selected, calendar: calendar),
            [2025, 2026]
        )
    }

    func testPriorityBandsMatchTaskCardBackgrounds() {
        XCTAssertEqual(SchedulePriorityAccent.band(for: "4"), .high)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "urgent"), .high)
        XCTAssertEqual(SchedulePriorityAccent.band(for: " HIGH "), .high)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "3"), .medium)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "medium"), .medium)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "2"), .low)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "low"), .low)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "1"), .other)
        XCTAssertEqual(SchedulePriorityAccent.band(for: nil), .other)
        XCTAssertEqual(SchedulePriorityAccent.band(for: "later"), .other)

        XCTAssertEqual(SchedulePriorityBand.high.priorityToken, "4")
        XCTAssertEqual(SchedulePriorityBand.medium.priorityToken, "3")
        XCTAssertEqual(SchedulePriorityBand.low.priorityToken, "2")
        XCTAssertEqual(SchedulePriorityBand.other.priorityToken, "1")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: .high).background, "#FEE2E2")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: .medium).background, "#FEF9C3")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: .low).background, "#DCFCE7")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: .other).background, "#DBEAFE")
        XCTAssertEqual(
            SchedulePriorityAccent.palette(for: .high).background,
            SchedulePriorityAccent.palette(for: "4").background
        )
        XCTAssertEqual(
            SchedulePriorityAccent.palette(for: .low).background,
            SchedulePriorityAccent.palette(for: "low").background
        )
    }

    func testDateStripSharesStackHighToOtherAndSkipEmptyBuckets() {
        var counts = DateStripDayPriorityCounts()
        counts.add(priority: "1")
        counts.add(priority: "2")
        counts.add(priority: "low")
        counts.add(priority: "3")
        counts.add(priority: "4")
        counts.add(priority: "urgent")
        counts.add(priority: nil)
        counts.add(priority: "nope")

        XCTAssertEqual(counts.high, 2)
        XCTAssertEqual(counts.medium, 1)
        XCTAssertEqual(counts.low, 2)
        XCTAssertEqual(counts.other, 3)
        XCTAssertEqual(counts.shares.map(\.band), [.high, .medium, .low, .other])
        XCTAssertEqual(counts.shares.map(\.fraction), [0.25, 0.125, 0.25, 0.375])
        XCTAssertEqual(counts.shares.map(\.fraction).reduce(0.0, +), 1, accuracy: 0.0001)

        var partial = DateStripDayPriorityCounts()
        partial.add(priority: "4")
        partial.add(priority: "2")
        XCTAssertEqual(partial.shares.map(\.band), [.high, .low])
        XCTAssertTrue(DateStripDayPriorityCounts().shares.isEmpty)
    }

    func testDateStripPriorityCountsUsesColumnSpanAndSkipsEmptyDays() throws {
        let days = (2...8).map { dayNumber in
            CalendarDay(key: String(format: "2026-11-%02d", dayNumber), day: dayNumber, inMonth: true)
        }
        let week = CalendarWeek(
            days: days,
            segments: [
                segment(id: "high", priority: "4", colStart: 1, colSpan: 1),
                segment(id: "med", priority: "medium", colStart: 1, colSpan: 2),
                segment(id: "low", priority: "2", colStart: 3, colSpan: 1)
            ]
        )

        let counts = dateStripPriorityCounts(from: [week])

        let nov2 = try XCTUnwrap(counts["2026-11-02"])
        let nov3 = try XCTUnwrap(counts["2026-11-03"])
        let nov4 = try XCTUnwrap(counts["2026-11-04"])
        XCTAssertEqual(nov2, DateStripDayPriorityCounts(high: 1, medium: 1))
        XCTAssertEqual(nov3, DateStripDayPriorityCounts(medium: 1))
        XCTAssertEqual(nov4, DateStripDayPriorityCounts(low: 1))
        XCTAssertNil(counts["2026-11-05"])
        XCTAssertEqual(nov2.shares.map(\.band), [.high, .medium])
        XCTAssertEqual(nov2.shares.map(\.fraction), [0.5, 0.5])
    }

    func testDateStripPriorityCountsEachTaskOnceAndClipsToTheWeek() throws {
        let day = CalendarDay(key: "2026-11-06", day: 6, inMonth: true)
        let repeated = CalendarWeek(
            days: [day],
            segments: [segment(id: "same", priority: "urgent", colStart: 1, colSpan: 1)]
        )
        let clippedDays = [
            CalendarDay(key: "2026-11-07", day: 7, inMonth: true),
            CalendarDay(key: "2026-11-08", day: 8, inMonth: true)
        ]
        let clipped = CalendarWeek(
            days: clippedDays,
            segments: [
                segment(id: "span", priority: "3", colStart: 2, colSpan: 5),
                segment(id: "bad", priority: "4", colStart: 0, colSpan: 1)
            ]
        )

        let counts = dateStripPriorityCounts(from: [repeated, repeated, clipped])

        let nov6 = try XCTUnwrap(counts["2026-11-06"])
        let nov8 = try XCTUnwrap(counts["2026-11-08"])
        XCTAssertEqual(nov6, DateStripDayPriorityCounts(high: 1))
        XCTAssertEqual(nov6.shares.map(\.fraction), [1])
        XCTAssertNil(counts["2026-11-07"])
        XCTAssertEqual(nov8, DateStripDayPriorityCounts(medium: 1))
    }

    func testTodoDateStripMonthAnchorsCoverVisibleRangeNeighborsAndSelectedMonth() {
        let inside = todoDateStripMonthAnchorsToPrefetch(
            around: date(2026, 3, 10),
            selectedDate: date(2026, 3, 12),
            calendar: calendar
        )
        XCTAssertEqual(monthKeys(inside), ["2026-02", "2026-03", "2026-04"])

        let crossing = todoDateStripMonthAnchorsToPrefetch(
            around: date(2025, 12, 28),
            selectedDate: date(2026, 1, 2),
            calendar: calendar
        )
        XCTAssertEqual(monthKeys(crossing), ["2025-11", "2025-12", "2026-01", "2026-02"])
    }

    func testExcludesTaskWithoutStartOrEnd() {
        let task = task(id: "untimed", startAt: nil, endAt: nil)

        XCTAssertFalse(taskCoversLocalDay(task, on: date(2026, 8, 17), calendar: calendar))
    }

    func testIncludesInstantTaskWhenStartEqualsEndOnSelectedDay() {
        let day = date(2026, 8, 17)
        let task = task(
            id: "instant",
            startAt: "2026-08-17T06:00:00Z",
            endAt: "2026-08-17T06:00:00Z"
        )

        XCTAssertTrue(taskCoversLocalDay(task, on: day, calendar: calendar))
    }

    func testAllDayRangeCoversStartDayAndNotNextDay() {
        let task = task(
            id: "all-day",
            startAt: "2026-08-16T16:00:00Z",
            endAt: "2026-08-17T16:00:00Z"
        )

        XCTAssertTrue(taskCoversLocalDay(task, on: date(2026, 8, 17), calendar: calendar))
        XCTAssertFalse(taskCoversLocalDay(task, on: date(2026, 8, 18), calendar: calendar))
    }

    func testFilterKeepsCoveringTasksAndPreservesStatusKeys() {
        let day = date(2026, 8, 17)
        let matching = task(
            id: "match",
            startAt: "2026-08-17T01:00:00Z",
            endAt: "2026-08-17T02:00:00Z"
        )
        let otherDay = task(
            id: "other",
            startAt: "2026-08-18T01:00:00Z",
            endAt: "2026-08-18T02:00:00Z"
        )
        let columns: [String: [ScheduleTask]] = [
            "todo": [matching, otherDay],
            "doing": [otherDay],
            "done": [matching],
            "archived": []
        ]

        let filtered = filterTodoColumnsCoveringLocalDay(columns, date: day, calendar: calendar)

        XCTAssertEqual(filtered["todo"]?.map(\.id), ["match"])
        XCTAssertEqual(filtered["doing"]?.map(\.id), [])
        XCTAssertEqual(filtered["done"]?.map(\.id), ["match"])
        XCTAssertEqual(filtered["archived"]?.map(\.id), [])
    }

    func testHidesLoadMoreWhenVisibleDayHasFewerThanAPage() {
        let paging = todoDaySectionPaging(
            visibleDayCount: 1,
            apiHasMore: true,
            isLoading: false
        )

        XCTAssertFalse(paging.showsLoadMore)
        XCTAssertFalse(paging.shouldAutoLoadMore)
    }

    func testDoesNotAutoLoadWhenVisibleDayIsEmpty() {
        let paging = todoDaySectionPaging(
            visibleDayCount: 0,
            apiHasMore: true,
            isLoading: false
        )

        XCTAssertFalse(paging.showsLoadMore)
        XCTAssertFalse(paging.shouldAutoLoadMore)
    }

    func testDoesNotAutoLoadWhileEmptyDayIsAlreadyLoading() {
        let paging = todoDaySectionPaging(
            visibleDayCount: 0,
            apiHasMore: true,
            isLoading: true
        )

        XCTAssertFalse(paging.showsLoadMore)
        XCTAssertFalse(paging.shouldAutoLoadMore)
    }

    func testShowsLoadMoreAfterAFullPageWhenApiHasMore() {
        let paging = todoDaySectionPaging(
            visibleDayCount: 5,
            apiHasMore: true,
            isLoading: false
        )

        XCTAssertTrue(paging.showsLoadMore)
        XCTAssertFalse(paging.shouldAutoLoadMore)
    }

    func testShowsLoadMoreWhenLocalTasksExceedTheRevealedPage() {
        let paging = todoDaySectionPaging(
            visibleDayCount: 8,
            apiHasMore: false,
            isLoading: false,
            revealedCount: 5
        )

        XCTAssertTrue(paging.showsLoadMore)
        XCTAssertEqual(todoSectionDisplayedCount(visibleDayCount: 8, revealedCount: 5), 5)
    }

    func testHidesLoadMoreWhenApiHasNoMorePages() {
        XCTAssertEqual(
            todoDaySectionPaging(visibleDayCount: 0, apiHasMore: false, isLoading: false),
            TodoDaySectionPaging(showsLoadMore: false, remainingCount: 0, shouldAutoLoadMore: false)
        )
        XCTAssertEqual(
            todoDaySectionPaging(visibleDayCount: 3, apiHasMore: false, isLoading: false),
            TodoDaySectionPaging(showsLoadMore: false, remainingCount: 0, shouldAutoLoadMore: false)
        )
        XCTAssertEqual(
            todoDaySectionPaging(visibleDayCount: 5, apiHasMore: false, isLoading: false),
            TodoDaySectionPaging(showsLoadMore: false, remainingCount: 0, shouldAutoLoadMore: false)
        )
    }

    func testOverdueUsesEndOfDeadlineCalendarDay() {
        let now = date(2026, 8, 17, hour: 15)

        XCTAssertTrue(isTodoTaskOverdue(
            task(id: "yesterday", status: "todo", startAt: nil, endAt: "2026-08-16T15:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskOverdue(
            task(id: "today", status: "todo", startAt: nil, endAt: "2026-08-17T08:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskOverdue(
            task(id: "today-late", status: "doing", startAt: nil, endAt: "2026-08-17T23:59:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskOverdue(
            task(id: "tomorrow", status: "todo", startAt: nil, endAt: "2026-08-18T09:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
    }

    func testOverdueFallsBackToStartWhenEndIsMissing() {
        let now = date(2026, 8, 17)

        XCTAssertTrue(isTodoTaskOverdue(
            task(id: "start-only", status: "doing", startAt: "2026-08-16T12:00:00+08:00", endAt: nil),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskOverdue(
            task(id: "untimed", status: "todo", startAt: nil, endAt: nil),
            now: now,
            calendar: calendar
        ))
    }

    func testCompletedAndArchivedTasksAreNotOverdue() {
        let now = date(2026, 8, 17)
        let past = "2026-08-10T12:00:00+08:00"

        XCTAssertFalse(isTodoTaskOverdue(
            task(id: "done", status: "done", startAt: nil, endAt: past),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskOverdue(
            task(id: "archived", status: "archived", startAt: nil, endAt: past),
            now: now,
            calendar: calendar
        ))
    }

    func testListsAllIncompleteOverdueTasksSortedByDeadline() {
        let now = date(2026, 8, 17)
        let older = task(id: "older", status: "todo", startAt: nil, endAt: "2026-08-10T12:00:00+08:00")
        let newer = task(id: "newer", status: "doing", startAt: nil, endAt: "2026-08-16T12:00:00+08:00")
        let today = task(id: "today", status: "todo", startAt: nil, endAt: "2026-08-17T12:00:00+08:00")
        let done = task(id: "done", status: "done", startAt: nil, endAt: "2026-08-10T12:00:00+08:00")
        let columns: [String: [ScheduleTask]] = [
            "todo": [today, older],
            "doing": [newer],
            "done": [done],
            "archived": []
        ]

        XCTAssertEqual(
            listOverdueTodoTasks(from: columns, now: now, calendar: calendar).map(\.id),
            ["older", "newer"]
        )
    }

    func testTodoSectionOrderPutsUndatedAfterFutureAndArchivedLast() {
        XCTAssertEqual(
            todoScheduleSectionOrder,
            ["todo", "doing", "done", "overdue", "future", "undated", "archived"]
        )
        XCTAssertEqual(todoScheduleSectionOrder.last, "archived")
        let overdue = todoScheduleSectionOrder.firstIndex(of: "overdue")!
        let future = todoScheduleSectionOrder.firstIndex(of: "future")!
        let undated = todoScheduleSectionOrder.firstIndex(of: "undated")!
        XCTAssertEqual(future, overdue + 1)
        XCTAssertEqual(undated, future + 1)
    }

    func testUndatedRequiresMissingStartAndEnd() {
        XCTAssertTrue(isTodoTaskUndated(
            task(id: "untimed", status: "todo", startAt: nil, endAt: nil)
        ))
        XCTAssertFalse(isTodoTaskUndated(
            task(id: "start-only", status: "todo", startAt: "2026-08-18T09:00:00+08:00", endAt: nil)
        ))
        XCTAssertFalse(isTodoTaskUndated(
            task(id: "end-only", status: "todo", startAt: nil, endAt: "2026-08-18T10:00:00+08:00")
        ))
        XCTAssertFalse(isTodoTaskUndated(
            task(id: "dated", status: "todo", startAt: "2026-08-18T09:00:00+08:00", endAt: "2026-08-18T10:00:00+08:00")
        ))
    }

    func testListsUndatedTasksSortedById() {
        let undatedB = task(id: "b-untimed", status: "todo", startAt: nil, endAt: nil)
        let undatedA = task(id: "a-untimed", status: "doing", startAt: nil, endAt: nil)
        let dated = task(id: "dated", status: "todo", startAt: "2026-08-18T09:00:00+08:00", endAt: nil)
        let columns: [String: [ScheduleTask]] = [
            "todo": [undatedB, dated],
            "doing": [undatedA],
            "done": [],
            "archived": []
        ]

        XCTAssertEqual(
            listUndatedTodoTasks(from: columns).map(\.id),
            ["a-untimed", "b-untimed"]
        )
    }

    func testFutureUsesStartOfRangeAfterToday() {
        let now = date(2026, 8, 17, hour: 15)

        XCTAssertTrue(isTodoTaskFuture(
            task(id: "tomorrow", status: "todo", startAt: "2026-08-18T09:00:00+08:00", endAt: "2026-08-18T10:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertTrue(isTodoTaskFuture(
            task(id: "start-only", status: "doing", startAt: "2026-08-20T12:00:00+08:00", endAt: nil),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskFuture(
            task(id: "today", status: "todo", startAt: "2026-08-17T08:00:00+08:00", endAt: "2026-08-17T09:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskFuture(
            task(id: "spanning", status: "doing", startAt: "2026-08-16T18:00:00+08:00", endAt: "2026-08-20T19:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskFuture(
            task(id: "yesterday", status: "todo", startAt: nil, endAt: "2026-08-16T18:00:00+08:00"),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskFuture(
            task(id: "untimed", status: "todo", startAt: nil, endAt: nil),
            now: now,
            calendar: calendar
        ))
        XCTAssertFalse(isTodoTaskFuture(
            task(id: "done-future", status: "done", startAt: "2026-08-20T12:00:00+08:00", endAt: nil),
            now: now,
            calendar: calendar
        ))
    }

    func testListsFutureTasksSortedByStart() {
        let now = date(2026, 8, 17)
        let later = task(id: "later", status: "todo", startAt: "2026-08-21T12:00:00+08:00", endAt: nil)
        let sooner = task(id: "sooner", status: "doing", startAt: "2026-08-18T09:00:00+08:00", endAt: "2026-08-18T10:00:00+08:00")
        let today = task(id: "today", status: "todo", startAt: "2026-08-17T12:00:00+08:00", endAt: nil)
        let columns: [String: [ScheduleTask]] = [
            "todo": [later, today],
            "doing": [sooner],
            "done": [],
            "archived": []
        ]

        XCTAssertEqual(
            listFutureTodoTasks(from: columns, now: now, calendar: calendar).map(\.id),
            ["sooner", "later"]
        )
    }

    func testPeopleFilterMatchesAssigneeParticipantOrAnyInvolvement() {
        let me = "user-me"
        let assigned = task(
            id: "assigned",
            startAt: "2026-08-17T01:00:00Z",
            endAt: nil,
            assignee: me
        )
        let participating = task(
            id: "participating",
            startAt: "2026-08-17T01:00:00Z",
            endAt: nil,
            participants: [me]
        )
        let created = task(
            id: "created",
            startAt: "2026-08-17T01:00:00Z",
            endAt: nil,
            createdBy: me,
            assignee: "user-other"
        )
        let unrelated = task(
            id: "unrelated",
            startAt: "2026-08-17T01:00:00Z",
            endAt: nil,
            createdBy: "user-other",
            assignee: "user-other",
            participants: ["user-other"]
        )

        XCTAssertTrue(taskMatchesTodoPeopleFilter(assigned, userId: me, filter: .assignee))
        XCTAssertFalse(taskMatchesTodoPeopleFilter(participating, userId: me, filter: .assignee))
        XCTAssertFalse(taskMatchesTodoPeopleFilter(created, userId: me, filter: .assignee))

        XCTAssertTrue(taskMatchesTodoPeopleFilter(participating, userId: me, filter: .participant))
        XCTAssertFalse(taskMatchesTodoPeopleFilter(assigned, userId: me, filter: .participant))

        XCTAssertTrue(taskMatchesTodoPeopleFilter(assigned, userId: me, filter: .all))
        XCTAssertTrue(taskMatchesTodoPeopleFilter(participating, userId: me, filter: .all))
        XCTAssertTrue(taskMatchesTodoPeopleFilter(created, userId: me, filter: .all))
        XCTAssertFalse(taskMatchesTodoPeopleFilter(unrelated, userId: me, filter: .all))
    }

    func testHorizontalSwipeChangesSelectedDayWhenClearlyHorizontal() {
        let day = date(2026, 9, 14)

        XCTAssertEqual(
            ScheduleFormat.dayKey(todoDateByHorizontalSwipe(from: day, translation: CGSize(width: -80, height: 8), calendar: calendar)!),
            "2026-09-15"
        )
        XCTAssertEqual(
            ScheduleFormat.dayKey(todoDateByHorizontalSwipe(from: day, translation: CGSize(width: 80, height: -6), calendar: calendar)!),
            "2026-09-13"
        )
        XCTAssertNil(todoDateByHorizontalSwipe(from: day, translation: CGSize(width: -20, height: 4), calendar: calendar))
        XCTAssertNil(todoDateByHorizontalSwipe(from: day, translation: CGSize(width: -40, height: 80), calendar: calendar))
    }

    private func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    private func monthKeys(_ dates: [Date]) -> [String] {
        dates.map { date in
            let parts = calendar.dateComponents([.year, .month], from: date)
            return String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
        }
    }

    private func segment(id: String, priority: String?, colStart: Int, colSpan: Int) -> CalendarSegment {
        CalendarSegment(
            item: task(id: id, startAt: nil, endAt: nil, priority: priority),
            colStart: colStart,
            colSpan: colSpan,
            lane: 0,
            roundLeft: true,
            roundRight: true
        )
    }

    private func task(
        id: String,
        status: String = "todo",
        startAt: String?,
        endAt: String?,
        priority: String? = nil,
        createdBy: String? = nil,
        assignee: String? = nil,
        participants: [String] = []
    ) -> ScheduleTask {
        ScheduleTask(
            id: id,
            title: id,
            body: nil,
            color: "#FFFFFF",
            status: status,
            priority: priority,
            startAt: startAt,
            endAt: endAt,
            completedAt: nil,
            details: nil,
            version: 1,
            createdBy: createdBy.map { UserBrief(id: $0, displayName: $0) },
            assignee: assignee.map { UserBrief(id: $0, displayName: $0) },
            participants: participants.map { UserBrief(id: $0, displayName: $0) },
            location: nil,
            workspaceId: "workspace-1",
            workspaceName: "空间",
            projectId: "project-1",
            projectName: "项目"
        )
    }
}
