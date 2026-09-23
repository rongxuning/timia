import XCTest
@testable import Timia

final class ScheduleMapClustersTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-09-22T04:00:00Z")!

    func testMergesSameCoordinateAndSplitsFarOnes() {
        let a = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        let same = mapItem(id: "b", lat: 31.1706, lng: 121.5364)
        let far = mapItem(id: "c", lat: 31.18, lng: 121.54)
        XCTAssertEqual(clusterScheduleMapItems([a, same, far], now: now, placeFallback: "这个地点").count, 2)
    }

    func testMerges29_9mAndSplits30_1m() {
        let origin = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        let near = offset(origin, id: "b", east: 29.9)
        let far = offset(origin, id: "b", east: 30.1)
        XCTAssertEqual(clusterScheduleMapItems([origin, near], now: now, placeFallback: "这个地点").count, 1)
        XCTAssertEqual(clusterScheduleMapItems([origin, far], now: now, placeFallback: "这个地点").count, 2)
    }

    func testDoesNotChainACThroughB() {
        let a = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        let b = offset(a, id: "b", east: 25)
        let c = offset(b, id: "c", east: 25)
        for order in [[a, b, c], [b, a, c]] {
            let clusters = clusterScheduleMapItems(order, now: now, placeFallback: "这个地点")
            let withA = clusters.first { $0.items.contains(where: { $0.id == "a" }) }
            XCTAssertFalse(withA?.items.contains(where: { $0.id == "c" }) ?? true)
        }
    }

    func testSortAndFocusMatchWeb() {
        let past = mapItem(id: "past", lat: 31.17, lng: 121.53, startAt: "2026-09-21T01:00:00.000Z")
        let soon = mapItem(id: "soon", lat: 31.17, lng: 121.53, startAt: "2026-09-22T05:00:00.000Z")
        let later = mapItem(id: "later", lat: 31.17, lng: 121.53, startAt: "2026-09-23T01:00:00.000Z")
        let sorted = sortScheduleMapClusterItems([later, past, soon])
        XCTAssertEqual(sorted.map(\.id), ["past", "soon", "later"])
        XCTAssertEqual(sorted[scheduleMapClusterFocusIndex(sorted, now: now)].id, "soon")
    }

    func testTimedSortUsesChineseTitleThenIdAndUndatedKeepInputOrder() {
        let undatedLater = titled("d", "未排期后", startAt: nil)
        let undatedEarlier = titled("c", "未排期前", startAt: nil)
        let late = titled("b", "B晚", startAt: "2026-09-20T03:00:00.000Z")
        let earlyLatin = titled("a", "A早", startAt: "2026-09-20T01:00:00.000Z")
        let sameStartB = titled("e", "同时B", startAt: "2026-09-20T01:00:00.000Z")
        let sameStartA = titled("f", "同时A", startAt: "2026-09-20T01:00:00.000Z")
        let sorted = sortScheduleMapClusterItems([
            undatedLater, undatedEarlier, late, earlyLatin, sameStartB, sameStartA,
        ])
        XCTAssertEqual(sorted.map(\.id), ["f", "e", "a", "b", "d", "c"])
    }

    func testMajorityTieUsesMergeOrderNotSortOrder() {
        let origin = mapItem(id: "a", lat: 31.1706, lng: 121.5364, startAt: "2026-09-25T01:00:00.000Z")
        var first = origin
        first.location = "后见名"
        var second = mapItem(id: "b", lat: origin.locationLat, lng: origin.locationLng, startAt: "2026-09-26T01:00:00.000Z")
        second.location = "后见名"
        let shifted = offset(origin, id: "c", east: 8)
        var third = mapItem(id: "c", lat: shifted.locationLat, lng: shifted.locationLng, startAt: "2026-09-20T01:00:00.000Z")
        third.location = "先排序名"
        var fourth = mapItem(id: "d", lat: shifted.locationLat, lng: shifted.locationLng, startAt: "2026-09-21T01:00:00.000Z")
        fourth.location = "先排序名"
        let clusters = clusterScheduleMapItems([first, second, third, fourth], now: now, placeFallback: "这个地点")
        XCTAssertEqual(clusters.count, 1)
        XCTAssertEqual(clusters[0].locationLat, origin.locationLat)
        XCTAssertEqual(clusters[0].locationLng, origin.locationLng)
        XCTAssertEqual(clusters[0].placeTitle, "后见名")
        XCTAssertEqual(clusters[0].items.map(\.id), ["c", "d", "a", "b"])
    }

    func testEmptyLocationsUsePlaceFallback() {
        var blank = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        blank.location = "  "
        var missing = mapItem(id: "b", lat: 31.1706, lng: 121.5364)
        missing.location = nil
        let clusters = clusterScheduleMapItems([blank, missing], now: now, placeFallback: "这个地点")
        XCTAssertEqual(clusters[0].placeTitle, "这个地点")
    }

    func testFocusFallsBackToFirstWhenNothingUpcoming() {
        let past = mapItem(id: "past", lat: 31.17, lng: 121.53, startAt: "2026-09-21T01:00:00.000Z")
        let undated = mapItem(id: "undated", lat: 31.17, lng: 121.53, startAt: nil)
        let sorted = sortScheduleMapClusterItems([past, undated])
        XCTAssertEqual(scheduleMapClusterFocusIndex(sorted, now: now), 0)
    }

    func testFanDragSnapAndTap() {
        XCTAssertEqual(applyScheduleMapFanDrag(index: 1, dx: -148, count: 5), 2, accuracy: 0.0001)
        XCTAssertEqual(applyScheduleMapFanDrag(index: 0, dx: 148, count: 3), -0.35, accuracy: 0.0001)
        XCTAssertEqual(snapScheduleMapFanIndex(index: 1, vx: -900, count: 5), 2)
        XCTAssertTrue(isScheduleMapFanTap(dx: 4, dy: 3, speed: 80))
        XCTAssertTrue(isScheduleMapFanDismissFlick(vx: 100, vy: 900))
        XCTAssertEqual(scheduleMapFanSlot(offset: 1)?.rotate ?? 0, 16, accuracy: 0.001)
        XCTAssertNil(scheduleMapFanSlot(offset: 2.01))
        XCTAssertEqual(scheduleMapFanLayout(origin: CGPoint(x: 200, y: 400), canvas: CGSize(width: 400, height: 600)).direction, -1)
    }

    func testReelStacksTilesVerticallyAndFlipsNearTheLeftEdge() {
        XCTAssertEqual(scheduleMapReelSlot(offset: 0)?.y ?? -1, 0, accuracy: 0.001)
        XCTAssertEqual(scheduleMapReelSlot(offset: 1)?.y ?? 0, 58, accuracy: 0.001)
        XCTAssertLessThan(scheduleMapReelSlot(offset: 1)?.scale ?? 1, 1)
        XCTAssertNil(scheduleMapReelSlot(offset: 2.01))
        XCTAssertEqual(scheduleMapReelSide(originX: 240, canvasWidth: 400), "left")
        XCTAssertEqual(scheduleMapReelSide(originX: 40, canvasWidth: 400), "right")
        XCTAssertEqual(
            applyScheduleMapFanDrag(index: 1, dx: -scheduleMapReelStepPx, count: 5, step: scheduleMapReelStepPx),
            2,
            accuracy: 0.0001
        )
    }

    func testFanMirrorsBelowTheAnchorNearTheTop() {
        let canvas = CGSize(width: 400, height: 600)
        let down = scheduleMapFanLayout(origin: CGPoint(x: 200, y: 40), canvas: canvas)
        XCTAssertEqual(down.direction, 1)
        let downCenter = scheduleMapFanCardOffset(indexOffset: 0, layout: down)
        let downSide = scheduleMapFanCardOffset(indexOffset: 1, layout: down)
        XCTAssertEqual(downCenter.y, 0, accuracy: 0.001)
        XCTAssertGreaterThan(downSide.y, downCenter.y)
        XCTAssertGreaterThan(downSide.x, 0)

        let up = scheduleMapFanLayout(origin: CGPoint(x: 200, y: 400), canvas: canvas)
        let upCenter = scheduleMapFanCardOffset(indexOffset: 0, layout: up)
        let upSide = scheduleMapFanCardOffset(indexOffset: 1, layout: up)
        XCTAssertEqual(upCenter.y, -scheduleMapFanCardHeight, accuracy: 0.001)
        XCTAssertLessThan(upSide.y, upCenter.y)
    }

    private func titled(_ id: String, _ title: String, startAt: String?) -> ScheduleMapItem {
        var item = mapItem(id: id, lat: 31.1706, lng: 121.5364, startAt: startAt)
        item.title = title
        return item
    }

    private func offset(_ item: ScheduleMapItem, id: String, east: Double) -> ScheduleMapItem {
        let dLng = (east / (earthRadiusM * cos(item.locationLat * .pi / 180))) * (180 / .pi)
        return mapItem(id: id, lat: item.locationLat, lng: item.locationLng + dLng, startAt: item.startAt)
    }

    private func mapItem(id: String, lat: Double, lng: Double, startAt: String? = nil) -> ScheduleMapItem {
        ScheduleMapItem(
            id: id, title: id, body: nil, color: "#FFFFFF", status: "todo", priority: "1",
            startAt: startAt, endAt: nil, completedAt: nil, details: nil, version: 1,
            createdBy: nil, assignee: nil, participants: nil, location: "文汇小区",
            locationLat: lat, locationLng: lng, workspaceId: "ws", workspaceName: "空间",
            projectId: "p", projectName: "项目"
        )
    }
}
