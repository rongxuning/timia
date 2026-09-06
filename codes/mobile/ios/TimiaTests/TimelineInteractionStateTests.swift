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

    func testBeginDragForcesExpandAndLocksScroll() {
        var state = TimelineInteractionState(idleCollapseEnabled: true)
        state.armInteractions()
        state.beginDrag()

        XCTAssertTrue(state.dragForcesExpandAll)
        XCTAssertTrue(state.scrollDisabled)
        XCTAssertFalse(state.effectiveCollapse)
        XCTAssertTrue(state.idleCollapseEnabled)
    }

    func testBeginDragIgnoredUntilArmed() {
        var state = TimelineInteractionState(idleCollapseEnabled: true)
        state.beginDrag()

        XCTAssertFalse(state.dragForcesExpandAll)
        XCTAssertFalse(state.scrollDisabled)
        XCTAssertTrue(state.effectiveCollapse)
    }

    func testEndDragRestoresCollapseAndUnlocksScroll() {
        var state = TimelineInteractionState(idleCollapseEnabled: true)
        state.armInteractions()
        state.beginDrag()
        state.endDrag()

        XCTAssertFalse(state.dragForcesExpandAll)
        XCTAssertFalse(state.scrollDisabled)
        XCTAssertTrue(state.effectiveCollapse)
    }

    func testResetClearsStuckDragAfterRangeSwitch() {
        var state = TimelineInteractionState(idleCollapseEnabled: true)
        state.armInteractions()
        state.beginDrag()

        state.resetTransient()

        XCTAssertFalse(state.dragForcesExpandAll)
        XCTAssertFalse(state.scrollDisabled)
        XCTAssertFalse(state.interactionsArmed)
        XCTAssertTrue(state.effectiveCollapse)

        state.toggleCollapse()
        XCTAssertFalse(state.effectiveCollapse)
        state.toggleCollapse()
        XCTAssertTrue(state.effectiveCollapse)
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
