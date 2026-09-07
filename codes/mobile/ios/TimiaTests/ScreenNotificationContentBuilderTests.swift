import XCTest
@testable import Timia

final class ScreenNotificationContentBuilderTests: XCTestCase {
    func testIsAllDayWhenSpanAtLeast23Hours() {
        XCTAssertTrue(
            ScreenNotificationContentBuilder.isAllDay(
                startAt: "2026-09-05T00:00:00+08:00",
                endAt: "2026-09-06T00:00:00+08:00"
            )
        )
    }

    func testIsNotAllDayForShortTimedTask() {
        XCTAssertFalse(
            ScreenNotificationContentBuilder.isAllDay(
                startAt: "2026-09-05T09:00:00+08:00",
                endAt: "2026-09-05T10:00:00+08:00"
            )
        )
    }

    func testIsAllDayWhenStartMissing() {
        XCTAssertTrue(ScreenNotificationContentBuilder.isAllDay(startAt: nil, endAt: nil))
    }

    func testFiltersPendingAllDayTodosOnly() {
        let todos = [
            task(id: "1", title: "晨跑", status: "todo", startAt: "2026-09-05T00:00:00+08:00", endAt: "2026-09-06T00:00:00+08:00"),
            task(id: "2", title: "已完成", status: "done", startAt: "2026-09-05T00:00:00+08:00", endAt: "2026-09-06T00:00:00+08:00"),
            task(id: "3", title: "开会", status: "todo", startAt: "2026-09-05T09:00:00+08:00", endAt: "2026-09-05T10:00:00+08:00"),
            task(id: "4", title: "进行中", status: "doing", startAt: "2026-09-05T00:00:00+08:00", endAt: "2026-09-06T00:00:00+08:00"),
        ]

        let filtered = ScreenNotificationContentBuilder.allDayPendingTodos(from: todos)
        XCTAssertEqual(filtered.map(\.id), ["1", "4"])
    }

    func testHealthTimeLabelRelativeMinutes() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let synced = now.addingTimeInterval(-5 * 60)
        XCTAssertEqual(
            ScreenNotificationContentBuilder.healthTimeLabel(lastSyncedAt: synced, now: now),
            "5分钟前"
        )
    }

    func testHealthTimeLabelNeverSynced() {
        XCTAssertEqual(
            ScreenNotificationContentBuilder.healthTimeLabel(lastSyncedAt: nil),
            "尚未同步"
        )
    }

    func testMakeContentStateHidesHealthWhenDisabled() {
        let todos = [
            task(id: "1", title: "全天待办", status: "todo", startAt: "2026-09-05T00:00:00+08:00", endAt: "2026-09-06T00:00:00+08:00"),
        ]
        let state = ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: false,
            lastSyncedAt: Date(),
            todos: todos
        )
        XCTAssertFalse(state.healthEnabled)
        XCTAssertEqual(state.todos.count, 1)
        XCTAssertEqual(state.todos[0].title, "全天待办")
        XCTAssertEqual(state.todos[0].timeLabel, "全天")
        XCTAssertEqual(state.workingCount, 0)
        XCTAssertEqual(state.allDayCount, 1)
        XCTAssertTrue(state.notStartedTodos.isEmpty)
        XCTAssertTrue(state.overdueTodos.isEmpty)
        XCTAssertTrue(state.doingTodos.isEmpty)
    }

    func testMakeContentStateIncludesHealthWhenEnabled() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let state = ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: true,
            lastSyncedAt: now.addingTimeInterval(-120),
            todos: [],
            now: now
        )
        XCTAssertTrue(state.healthEnabled)
        XCTAssertEqual(state.healthTitle, "健康数据同步")
        XCTAssertEqual(state.healthTimeLabel, "2分钟前")
        XCTAssertEqual(state.workingCount, 1)
        XCTAssertEqual(state.allDayCount, 0)
        XCTAssertTrue(state.todos.isEmpty)
    }

    func testMakeContentStateSplitsNotStartedOverdueAndAllDay() {
        let calendar = shanghaiCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 7, hour: 18))!
        let dayTasks = [
            task(
                id: "not-started",
                title: "截止提交",
                status: "todo",
                startAt: "2026-09-07T09:00:00+08:00",
                endAt: "2026-09-07T10:00:00+08:00"
            ),
            task(
                id: "doing",
                title: "写周报",
                status: "doing",
                startAt: "2026-09-07T15:00:00+08:00",
                endAt: "2026-09-07T16:00:00+08:00"
            ),
            task(
                id: "all-day",
                title: "值班",
                status: "todo",
                startAt: "2026-09-07T00:00:00+08:00",
                endAt: "2026-09-08T00:00:00+08:00"
            ),
            task(
                id: "done",
                title: "maddox",
                status: "done",
                startAt: "2026-09-07T15:00:00+08:00",
                endAt: "2026-09-07T17:00:00+08:00"
            ),
        ]
        let overdue = [
            task(
                id: "overdue",
                title: "soho 简厨",
                status: "todo",
                startAt: "2026-09-04T18:00:00+08:00",
                endAt: "2026-09-04T19:00:00+08:00"
            ),
        ]

        let state = ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: true,
            lastSyncedAt: nil,
            todos: dayTasks,
            overdue: overdue,
            now: now,
            calendar: calendar
        )

        XCTAssertEqual(state.workingCount, 2)
        XCTAssertEqual(state.doingTodos.map(\.title), ["写周报"])
        XCTAssertEqual(state.notStartedTodos.map(\.title), ["截止提交"])
        XCTAssertEqual(state.notStartedTodos[0].timeLabel, "09:00 – 10:00")
        XCTAssertEqual(state.overdueTodos.map(\.title), ["soho 简厨"])
        XCTAssertEqual(state.overdueTodos[0].timeLabel, "9月4日 18:00 – 19:00")
        XCTAssertEqual(state.todos.map(\.title), ["值班"])
        XCTAssertEqual(state.todos[0].timeLabel, "全天")
        XCTAssertEqual(state.notStartedCount, 1)
        XCTAssertEqual(state.overdueCount, 1)
        XCTAssertEqual(state.allDayCount, 1)
    }

    func testTimedTodoDoesNotAppearInAllDaySection() {
        let calendar = shanghaiCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 7, hour: 18))!
        let todos = [
            task(
                id: "timed",
                title: "截止提交",
                status: "todo",
                startAt: "2026-09-07T09:00:00+08:00",
                endAt: "2026-09-07T10:00:00+08:00"
            ),
        ]
        let state = ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: false,
            lastSyncedAt: nil,
            todos: todos,
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(state.notStartedTodos.map(\.id), ["timed"])
        XCTAssertTrue(state.todos.isEmpty)
        XCTAssertEqual(state.workingCount, 0)
    }

    func testOverdueTaskIsExcludedFromTodayBuckets() {
        let calendar = shanghaiCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 7, hour: 18))!
        let overdue = task(
            id: "overdue-today-dup",
            title: "旧任务",
            status: "todo",
            startAt: "2026-09-04T18:00:00+08:00",
            endAt: "2026-09-04T19:00:00+08:00"
        )
        let state = ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: false,
            lastSyncedAt: nil,
            todos: [overdue],
            overdue: [overdue],
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(state.overdueTodos.map(\.id), ["overdue-today-dup"])
        XCTAssertTrue(state.notStartedTodos.isEmpty)
        XCTAssertTrue(state.todos.isEmpty)
    }

    func testPastDeadlineInDayListGoesToOverdueWithoutApiList() {
        let calendar = shanghaiCalendar()
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 7, hour: 18))!
        let past = task(
            id: "past",
            title: "soho 简厨",
            status: "todo",
            startAt: "2026-09-04T18:00:00+08:00",
            endAt: "2026-09-04T19:00:00+08:00"
        )
        let state = ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: false,
            lastSyncedAt: nil,
            todos: [past],
            overdue: [],
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(state.overdueTodos.map(\.id), ["past"])
        XCTAssertTrue(state.notStartedTodos.isEmpty)
        XCTAssertTrue(state.todos.isEmpty)
    }

    func testContentStateDecodesLegacyPayloadWithoutNewSections() throws {
        let json = """
        {"healthEnabled":true,"healthTitle":"健康数据同步","healthTimeLabel":"尚未同步","todos":[],"workingCount":1}
        """
        let state = try JSONDecoder().decode(
            TimiaScreenActivityAttributes.ContentState.self,
            from: Data(json.utf8)
        )
        XCTAssertTrue(state.healthEnabled)
        XCTAssertEqual(state.workingCount, 1)
        XCTAssertTrue(state.doingTodos.isEmpty)
        XCTAssertTrue(state.notStartedTodos.isEmpty)
        XCTAssertTrue(state.overdueTodos.isEmpty)
        XCTAssertEqual(state.totalCount, 1)
    }

    func testPreferenceRoundTrip() {
        let previous = ScreenNotificationPreference.current
        defer { ScreenNotificationPreference.current = previous }

        ScreenNotificationPreference.current = .allowed
        XCTAssertEqual(ScreenNotificationPreference.current, .allowed)
        XCTAssertTrue(ScreenNotificationPreference.current.isAllowed)

        ScreenNotificationPreference.current = .denied
        XCTAssertEqual(ScreenNotificationPreference.current, .denied)
        XCTAssertFalse(ScreenNotificationPreference.current.isAllowed)

        ScreenNotificationPreference.current = .unset
        XCTAssertEqual(ScreenNotificationPreference.current, .unset)
    }

    private func shanghaiCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return calendar
    }

    private func task(
        id: String,
        title: String,
        status: String,
        startAt: String?,
        endAt: String?
    ) -> ScheduleTask {
        ScheduleTask(
            id: id,
            title: title,
            body: nil,
            color: "#3366FF",
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
            workspaceId: "ws",
            workspaceName: "WS",
            projectId: "p",
            projectName: "P"
        )
    }
}
