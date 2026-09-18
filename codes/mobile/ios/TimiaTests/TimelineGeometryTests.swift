import XCTest
@testable import Timia

final class TimelineGeometryTests: XCTestCase {
    func testFullDayVisibleHeight() {
        let g = TimelineGeometry(
            collapsibleIdles: [],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        XCTAssertEqual(g.contentHeight, 24 * 74, accuracy: 0.1)
    }

    func testCollapsedGapShrinksHeight() {
        let gap = MinuteRange(start: 0, end: 6 * 60) // 6h → 28pt instead of 6*74
        let g = TimelineGeometry(
            collapsibleIdles: [gap],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        let expected: CGFloat = 28 + 18 * 74
        XCTAssertEqual(g.contentHeight, expected, accuracy: 0.1)
    }

    func testMinutesRoundTripOutsideCollapse() {
        let g = TimelineGeometry(
            collapsibleIdles: [MinuteRange(start: 0, end: 6 * 60)],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        let y = g.y(forMinutes: 9 * 60)
        XCTAssertEqual(g.minutes(atY: y), 9 * 60)
    }

    func testCollapseDisabledShowsFullHeight() {
        let gap = MinuteRange(start: 0, end: 6 * 60)
        let g = TimelineGeometry(
            collapsibleIdles: [gap],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: false
        )
        XCTAssertEqual(g.contentHeight, 24 * 74, accuracy: 0.1)
        XCTAssertEqual(g.segments, [.visible(MinuteRange(start: 0, end: 1440))])
    }

    func testCollapsedSegmentMinutesReturnsMidpoint() {
        let g = TimelineGeometry(
            collapsibleIdles: [MinuteRange(start: 0, end: 6 * 60)],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        XCTAssertEqual(g.minutes(atY: 14), 3 * 60)
    }

    func testHeightForDurationInVisibleSegment() {
        let g = TimelineGeometry(
            collapsibleIdles: [MinuteRange(start: 0, end: 6 * 60)],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        XCTAssertEqual(g.height(forDurationMinutes: 60, startingAt: 9 * 60), 74, accuracy: 0.1)
    }

    func testHourLabelIncludesBusyEndWhenTrailingIdleCollapsed() {
        // Task 08:00–10:00 → visible [480, 600); idle before/after collapsed.
        let g = TimelineGeometry(
            collapsibleIdles: [
                MinuteRange(start: 0, end: 8 * 60),
                MinuteRange(start: 10 * 60, end: 1440),
            ],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        XCTAssertFalse(g.shouldShowHourLabel(at: 0))
        XCTAssertTrue(g.shouldShowHourLabel(at: 8 * 60))
        XCTAssertTrue(g.shouldShowHourLabel(at: 9 * 60))
        XCTAssertTrue(g.shouldShowHourLabel(at: 10 * 60), "end of busy block must keep its hour tick")
        XCTAssertFalse(g.shouldShowHourLabel(at: 11 * 60))
        XCTAssertTrue(g.shouldShowHourLabel(at: 24 * 60))
    }

    func testHourLabelsCoverFullDayWhenCollapseDisabled() {
        let g = TimelineGeometry(
            collapsibleIdles: [MinuteRange(start: 0, end: 8 * 60)],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: false
        )
        for hour in 0...24 {
            XCTAssertTrue(g.shouldShowHourLabel(at: hour * 60), "hour \(hour)")
        }
    }
}
