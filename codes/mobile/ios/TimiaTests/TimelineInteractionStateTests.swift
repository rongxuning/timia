import XCTest
@testable import Timia

final class TimelineInteractionStateTests: XCTestCase {
    func testToggleChangesCollapseWhenNotDragging() {
        var state = TimelineInteractionState(idleCollapseEnabled: true)
        XCTAssertTrue(state.effectiveCollapse)
        XCTAssertFalse(state.scrollDisabled)

        state.toggleCollapse()
        XCTAssertFalse(state.idleCollapseEnabled)
        XCTAssertFalse(state.effectiveCollapse)

        state.toggleCollapse()
        XCTAssertTrue(state.effectiveCollapse)
    }

    func testCollapsedTimelineDoesNotAllowDrag() {
        var state = TimelineInteractionState(idleCollapseEnabled: true)
        state.armInteractions()

        XCTAssertFalse(state.allowsTaskDrag)
        state.beginDrag()
        XCTAssertFalse(state.scrollDisabled)
        XCTAssertTrue(state.effectiveCollapse)
    }

    func testExpandedTimelineAllowsDragWithoutExpanding() {
        var state = TimelineInteractionState(idleCollapseEnabled: false)
        state.armInteractions()
        state.beginDrag()

        XCTAssertTrue(state.allowsTaskDrag)
        XCTAssertTrue(state.scrollDisabled)
        XCTAssertFalse(state.effectiveCollapse)
        XCTAssertFalse(state.idleCollapseEnabled)
    }

    func testBeginDragIgnoredUntilArmed() {
        var state = TimelineInteractionState(idleCollapseEnabled: false)
        state.beginDrag()

        XCTAssertFalse(state.scrollDisabled)
        XCTAssertTrue(state.allowsTaskDrag)
    }

    func testEndDragRestoresCollapseAndUnlocksScroll() {
        var state = TimelineInteractionState(idleCollapseEnabled: false)
        state.armInteractions()
        state.beginDrag()
        state.endDrag()

        XCTAssertFalse(state.scrollDisabled)
        XCTAssertFalse(state.effectiveCollapse)
        XCTAssertTrue(state.allowsTaskDrag)
    }

    func testToggleCollapseClearsDragLock() {
        var state = TimelineInteractionState(idleCollapseEnabled: false)
        state.armInteractions()
        state.beginDrag()
        XCTAssertTrue(state.scrollDisabled)

        state.toggleCollapse()

        XCTAssertTrue(state.idleCollapseEnabled)
        XCTAssertTrue(state.effectiveCollapse)
        XCTAssertFalse(state.allowsTaskDrag)
        XCTAssertFalse(state.scrollDisabled)
    }

    func testResetClearsStuckDragAfterRangeSwitch() {
        var state = TimelineInteractionState(idleCollapseEnabled: false)
        state.armInteractions()
        state.beginDrag()

        state.resetTransient()

        XCTAssertFalse(state.scrollDisabled)
        XCTAssertFalse(state.interactionsArmed)
        XCTAssertFalse(state.effectiveCollapse)
        XCTAssertTrue(state.allowsTaskDrag)

        state.toggleCollapse()
        XCTAssertTrue(state.effectiveCollapse)
        XCTAssertFalse(state.allowsTaskDrag)
        state.toggleCollapse()
        XCTAssertFalse(state.effectiveCollapse)
        XCTAssertTrue(state.allowsTaskDrag)
    }

    func testWeekPagingWindowIsBounded() {
        let window = CalendarInfiniteWindow.weekOffsets
        XCTAssertEqual(window.lowerBound, -16)
        XCTAssertEqual(window.upperBound, 16)
        XCTAssertLessThan(window.count, 40)
    }

    func testWeekAnchorRecentersOnlyWhenFarAway() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        let anchor = Date(timeIntervalSince1970: 1_788_768_000) // 2026-09-06
        let nearby = calendar.date(byAdding: .weekOfYear, value: 8, to: anchor) ?? anchor
        let far = calendar.date(byAdding: .weekOfYear, value: 20, to: anchor) ?? anchor

        XCTAssertFalse(CalendarInfiniteWindow.shouldRecenterWeekAnchor(from: anchor, to: nearby, calendar: calendar))
        XCTAssertTrue(CalendarInfiniteWindow.shouldRecenterWeekAnchor(from: anchor, to: far, calendar: calendar))
    }
}
