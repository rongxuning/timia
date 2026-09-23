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

    func testPinCopyAddsStatusAsThirdLine() {
        let copy = scheduleMapPinCopy(
            title: "lucy辅导",
            count: 1,
            startAt: nil,
            endAt: nil,
            status: "done"
        )
        XCTAssertEqual(copy.title, "lucy辅导")
        XCTAssertEqual(copy.timeLabel, "未排期")
        XCTAssertEqual(copy.statusLabel, "已完成")
        XCTAssertEqual(copy.countDisplay, "")
    }

    func testPinCopyKeepsTitleAndPutsCountOnBadge() {
        let copy = scheduleMapPinCopy(
            title: "喂猫",
            count: 3,
            startAt: nil,
            endAt: nil,
            status: "todo"
        )
        XCTAssertEqual(copy.title, "喂猫")
        XCTAssertFalse(copy.title.contains("等"))
        XCTAssertEqual(copy.countDisplay, "3")
    }

    func testCountDisplayHidesSingleAndCapsAt99Plus() {
        XCTAssertEqual(scheduleMapCountDisplay(1), "")
        XCTAssertEqual(scheduleMapCountDisplay(2), "2")
        XCTAssertEqual(scheduleMapCountDisplay(120), "99+")
    }

    func testPinCopyUsesPriorityBackgroundHex() {
        XCTAssertEqual(SchedulePriorityAccent.palette(for: "1").background, "#DBEAFE")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: "2").background, "#DCFCE7")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: "3").background, "#FEF9C3")
        XCTAssertEqual(SchedulePriorityAccent.palette(for: "4").background, "#FEE2E2")
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

    func testMapLoadFailureUsesChineseMessageForMissingRoute() {
        XCTAssertEqual(
            scheduleMapLoadFailureMessage(APIError.server(status: 404, message: "Not Found")),
            "无法加载地图任务"
        )
        XCTAssertEqual(
            scheduleMapLoadFailureMessage(APIError.server(status: 404, message: "not_found")),
            "无法加载地图任务"
        )
    }

    func testMapLoadFailureUsesLocalizedDescriptionForOtherErrors() {
        XCTAssertEqual(
            scheduleMapLoadFailureMessage(APIError.unauthorized),
            "登录已过期，请重新登录"
        )
    }

    func testFilterBarAlignsStatusAndScopeLabels() {
        XCTAssertEqual(ScheduleMapFilterBarLayout.statusLabel, "状态")
        XCTAssertEqual(ScheduleMapFilterBarLayout.scopeLabel, "范围")
        XCTAssertEqual(ScheduleMapFilterBarLayout.statusLabel.count, ScheduleMapFilterBarLayout.scopeLabel.count)
        XCTAssertEqual(ScheduleMapFilterBarLayout.labelColumnWidth, 40)
        XCTAssertEqual(ScheduleMapFilterBarLayout.rowMinHeight, 32)
    }

    func testMapCanvasPrefersLoadErrorOverEmptyState() {
        XCTAssertEqual(
            scheduleMapCanvasMessage(
                isLoading: false,
                loadError: "无法加载地图任务",
                hasResponse: false,
                itemCount: 0,
                isDefaultFilters: true
            ),
            "无法加载地图任务"
        )
    }

    func testMapCanvasEmptyStateWhenLoadedWithoutItems() {
        XCTAssertEqual(
            scheduleMapCanvasMessage(
                isLoading: false,
                loadError: nil,
                hasResponse: true,
                itemCount: 0,
                isDefaultFilters: true
            ),
            "还没有带地点的任务。在网页添加任务并搜索地址后会出现在这里。"
        )
        XCTAssertEqual(
            scheduleMapCanvasMessage(
                isLoading: false,
                loadError: nil,
                hasResponse: true,
                itemCount: 0,
                isDefaultFilters: false
            ),
            "没有符合筛选条件的地点任务。"
        )
    }

    func testMapCanvasHidesMessageWhileLoading() {
        XCTAssertNil(
            scheduleMapCanvasMessage(
                isLoading: true,
                loadError: nil,
                hasResponse: false,
                itemCount: 0,
                isDefaultFilters: true
            )
        )
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
