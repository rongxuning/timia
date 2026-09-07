import XCTest
@testable import Timia

final class TimelineIdleChromeTests: XCTestCase {
    func testCollapsedTaskAndGapShareHorizontalEdges() {
        let geometry = makeCollapsedGeometry()
        let contentWidth: CGFloat = 300
        let inset = TimelineIdleChrome.dayHorizontalInset
        let upper = TimelineIdleChrome.gapLayout(
            range: MinuteRange(start: 0, end: 9 * 60),
            geometry: geometry,
            contentWidth: contentWidth,
            horizontalInset: inset,
            taskStarts: [9 * 60],
            taskEnds: [10 * 60]
        )

        XCTAssertEqual(upper.x, TimelineIdleChrome.labelWidth + inset)
        XCTAssertEqual(upper.width, contentWidth - inset * 2)
    }

    func testCollapsedGapJoinsTaskWithoutGapOrOverlap() {
        let geometry = makeCollapsedGeometry()
        let contentWidth: CGFloat = 300
        let inset = TimelineIdleChrome.dayHorizontalInset
        let upper = TimelineIdleChrome.gapLayout(
            range: MinuteRange(start: 0, end: 9 * 60),
            geometry: geometry,
            contentWidth: contentWidth,
            horizontalInset: inset,
            taskStarts: [9 * 60],
            taskEnds: [10 * 60]
        )
        let task = TimelineIdleChrome.taskVerticalLayout(
            startMinutes: 9 * 60,
            durationMinutes: 60,
            geometry: geometry,
            cornerRadius: TimelineIdleChrome.dayCornerRadius,
            minimumHeight: 48
        )
        let lower = TimelineIdleChrome.gapLayout(
            range: MinuteRange(start: 10 * 60, end: 1440),
            geometry: geometry,
            contentWidth: contentWidth,
            horizontalInset: inset,
            taskStarts: [9 * 60],
            taskEnds: [10 * 60]
        )

        XCTAssertEqual(upper.y + upper.height, task.y, accuracy: 0.1)
        XCTAssertEqual(task.y + task.height, lower.y, accuracy: 0.1)
        XCTAssertEqual(upper.bottomRadius, 0)
        XCTAssertEqual(task.topRadius, 0)
        XCTAssertEqual(task.bottomRadius, 0)
        XCTAssertEqual(lower.topRadius, 0)
        XCTAssertEqual(upper.topRadius, TimelineIdleChrome.gapCornerRadius)
        XCTAssertEqual(lower.bottomRadius, TimelineIdleChrome.gapCornerRadius)
    }

    func testExpandedTasksKeepDefaultNudge() {
        let geometry = TimelineGeometry(
            collapsibleIdles: [MinuteRange(start: 0, end: 9 * 60)],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: false
        )
        let task = TimelineIdleChrome.taskVerticalLayout(
            startMinutes: 9 * 60,
            durationMinutes: 60,
            geometry: geometry,
            cornerRadius: 16,
            minimumHeight: 48
        )
        XCTAssertEqual(task.y, geometry.y(forMinutes: 9 * 60) + TimelineIdleChrome.blockYOffset, accuracy: 0.1)
        XCTAssertEqual(task.height, 74, accuracy: 0.1)
        XCTAssertEqual(task.topRadius, 16)
        XCTAssertEqual(task.bottomRadius, 16)
    }

    func testWeekGapUsesTaskInset() {
        let geometry = makeCollapsedGeometry()
        let layout = TimelineIdleChrome.gapLayout(
            range: MinuteRange(start: 0, end: 9 * 60),
            geometry: geometry,
            contentWidth: 700,
            horizontalInset: TimelineIdleChrome.weekHorizontalInset,
            taskStarts: [9 * 60],
            taskEnds: [10 * 60]
        )
        XCTAssertEqual(layout.x, TimelineIdleChrome.labelWidth + TimelineIdleChrome.weekHorizontalInset)
        XCTAssertEqual(layout.width, 700 - TimelineIdleChrome.weekHorizontalInset * 2)
    }

    func testGeometryReportsCollapsedBoundaries() {
        let geometry = makeCollapsedGeometry()
        XCTAssertTrue(geometry.collapsedSegmentEnds(at: 9 * 60))
        XCTAssertTrue(geometry.collapsedSegmentStarts(at: 10 * 60))
        XCTAssertFalse(geometry.collapsedSegmentStarts(at: 9 * 60))
        XCTAssertFalse(geometry.collapsedSegmentEnds(at: 10 * 60))
    }

    func testShortTaskAtCollapsedBoundaryDoesNotOverflowGap() {
        let geometry = TimelineGeometry(
            collapsibleIdles: [
                MinuteRange(start: 0, end: 9 * 60),
                MinuteRange(start: 9 * 60 + 30, end: 1440)
            ],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
        let task = TimelineIdleChrome.taskVerticalLayout(
            startMinutes: 9 * 60,
            durationMinutes: 30,
            geometry: geometry,
            cornerRadius: 16,
            minimumHeight: 48
        )
        let lower = TimelineIdleChrome.gapLayout(
            range: MinuteRange(start: 9 * 60 + 30, end: 1440),
            geometry: geometry,
            contentWidth: 300,
            horizontalInset: TimelineIdleChrome.dayHorizontalInset,
            taskStarts: [9 * 60],
            taskEnds: [9 * 60 + 30]
        )
        XCTAssertEqual(task.y + task.height, lower.y, accuracy: 0.1)
        XCTAssertEqual(task.height, 37, accuracy: 0.1)
    }

    private func makeCollapsedGeometry() -> TimelineGeometry {
        TimelineGeometry(
            collapsibleIdles: [
                MinuteRange(start: 0, end: 9 * 60),
                MinuteRange(start: 10 * 60, end: 1440)
            ],
            hourHeight: 74,
            collapsedHeight: 28,
            collapseEnabled: true
        )
    }
}
