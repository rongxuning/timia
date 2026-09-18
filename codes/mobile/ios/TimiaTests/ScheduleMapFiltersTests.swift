import XCTest
@testable import Timia

final class ScheduleMapFiltersTests: XCTestCase {
    func testDefaultStatusesAreTodoAndDoing() {
        let filters = ScheduleMapFilters.default
        XCTAssertEqual(filters.statuses, [.todo, .doing])
        XCTAssertNil(filters.workspaceId)
        XCTAssertNil(filters.projectId)
        XCTAssertTrue(filters.isDefault)
    }

    func testToggleKeepsAtLeastOneStatus() {
        let onlyTodo = toggleMapStatus([.todo], .todo)
        XCTAssertEqual(onlyTodo, [.todo])
    }

    func testToggleAddsAndRemovesStatusesInCanonicalOrder() {
        var statuses = ScheduleMapFilters.default.statuses
        statuses = toggleMapStatus(statuses, .done)
        XCTAssertEqual(statuses, [.todo, .doing, .done])
        statuses = toggleMapStatus(statuses, .todo)
        XCTAssertEqual(statuses, [.doing, .done])
    }

    func testSetWorkspaceClearsProject() {
        var filters = ScheduleMapFilters.default
        filters.projectId = "project-1"
        filters = setMapWorkspace(filters, workspaceId: "workspace-1")
        XCTAssertEqual(filters.workspaceId, "workspace-1")
        XCTAssertNil(filters.projectId)
        XCTAssertFalse(filters.isDefault)
    }

    func testSetProjectRequiresWorkspace() {
        let filters = setMapProject(ScheduleMapFilters.default, projectId: "project-1")
        XCTAssertNil(filters.projectId)
    }

    func testSetProjectWhenWorkspaceSelected() {
        let withWorkspace = setMapWorkspace(ScheduleMapFilters.default, workspaceId: "workspace-1")
        let filters = setMapProject(withWorkspace, projectId: "project-1")
        XCTAssertEqual(filters.projectId, "project-1")
    }

    func testQueryItemsIncludeRepeatedStatus() {
        let items = scheduleMapQueryItems(filters: .default)
        let statuses = items.filter { $0.name == "status" }.compactMap(\.value)
        XCTAssertEqual(statuses, ["todo", "doing"])
        XCTAssertEqual(items.first(where: { $0.name == "scope" })?.value, "me")
    }

    func testGroupByCoordinateKeepsOrder() {
        let a = mapItem(id: "a", lat: 31.2, lng: 121.5)
        let b = mapItem(id: "b", lat: 31.2, lng: 121.5)
        let c = mapItem(id: "c", lat: 39.9, lng: 116.4)
        let groups = groupScheduleMapItemsByCoordinate([a, b, c])
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups[0].map(\.id), ["a", "b"])
        XCTAssertEqual(groups[1].map(\.id), ["c"])
    }

    func testTimeLabelFallsBackToUndated() {
        XCTAssertEqual(scheduleMapTimeLabel(startAt: nil, endAt: nil), "未排期")
    }

    func testPriorityAccentUsesDistinctColors() {
        XCTAssertEqual(SchedulePriorityAccent.hex(for: "1"), "#3B82F6")
        XCTAssertEqual(SchedulePriorityAccent.hex(for: "2"), "#22C55E")
        XCTAssertEqual(SchedulePriorityAccent.hex(for: "3"), "#EAB308")
        XCTAssertEqual(SchedulePriorityAccent.hex(for: "4"), "#EF4444")
    }

    func testPlaceTitleFormatting() {
        XCTAssertEqual(ScheduleMapPlaceTitle.formatPlaceTitle(country: "中国", city: "北京"), "中国 · 北京")
        XCTAssertEqual(ScheduleMapPlaceTitle.formatPlaceTitle(country: "日本", city: nil), "日本")
        XCTAssertNil(ScheduleMapPlaceTitle.formatPlaceTitle(country: nil, city: nil))
    }

    private func mapItem(id: String, lat: Double, lng: Double) -> ScheduleMapItem {
        ScheduleMapItem(
            id: id,
            title: id,
            body: nil,
            color: "#FFFFFF",
            status: "todo",
            priority: "1",
            startAt: nil,
            endAt: nil,
            completedAt: nil,
            details: nil,
            version: 1,
            createdBy: nil,
            assignee: nil,
            participants: nil,
            location: "地点",
            locationLat: lat,
            locationLng: lng,
            workspaceId: "ws",
            workspaceName: "空间",
            projectId: "p",
            projectName: "项目"
        )
    }
}
