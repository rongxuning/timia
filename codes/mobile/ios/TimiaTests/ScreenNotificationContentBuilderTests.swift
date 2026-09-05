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
        XCTAssertEqual(state.workingCount, 1)
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
