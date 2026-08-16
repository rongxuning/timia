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

    private func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    private func task(id: String, status: String = "todo", startAt: String?, endAt: String?) -> ScheduleTask {
        ScheduleTask(
            id: id,
            title: id,
            body: nil,
            color: "#FFFFFF",
            status: status,
            priority: nil,
            startAt: startAt,
            endAt: endAt,
            completedAt: nil,
            details: nil,
            version: 1,
            createdBy: nil,
            assignee: nil,
            participants: nil,
            location: nil,
            workspaceId: "workspace-1",
            workspaceName: "空间",
            projectId: "project-1",
            projectName: "项目"
        )
    }
}
