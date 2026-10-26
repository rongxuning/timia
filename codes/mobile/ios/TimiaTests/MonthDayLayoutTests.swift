import XCTest
@testable import Timia

final class MonthDayLayoutTests: XCTestCase {
    func testShortTitlesStayWhole() {
        XCTAssertEqual(monthTaskTitle(""), "")
        XCTAssertEqual(monthTaskTitle("飞"), "飞")
        XCTAssertEqual(monthTaskTitle("韩国旅行"), "韩国旅行")
        XCTAssertEqual(monthTaskTitle("韩国旅行记"), "韩国旅行记")
        XCTAssertEqual(monthTaskTitle("hello"), "hello")
        XCTAssertEqual(monthTaskTitle("12km跑"), "12km跑")
    }

    func testLongTitlesKeepFourCharactersAndAnEllipsis() {
        XCTAssertEqual(monthTaskTitle("韩国旅行日记"), "韩国旅行…")
        XCTAssertEqual(monthTaskTitle("韩国旅行日记").count, MonthDayMetrics.titleCharacterLimit)
        XCTAssertEqual(monthTaskTitle("hello!"), "hell…")
        XCTAssertEqual(monthTaskTitle("hybird"), "hybi…")
        XCTAssertEqual(monthTaskTitle("CF综合训练"), "CF综合…")
        XCTAssertEqual(monthTaskTitle("  旅行日记"), "  旅行…")
    }

    func testCountsGraphemeClustersNotUTF16() {
        let composed = "e\u{0301}"
        XCTAssertEqual(composed.count, 1)
        XCTAssertGreaterThan(composed.utf16.count, 1)

        let five = String(repeating: composed, count: 5)
        let six = String(repeating: composed, count: 6)
        XCTAssertEqual(monthTaskTitle(five), five)
        XCTAssertEqual(monthTaskTitle(six), String(repeating: composed, count: 4) + "…")
    }

    func testCustomLimitStillReservesTheLastSlotForTheEllipsis() {
        XCTAssertEqual(monthTaskTitle("韩国旅行", limit: 3), "韩国…")
        XCTAssertEqual(monthTaskTitle("韩国", limit: 3), "韩国")
        XCTAssertEqual(monthTaskTitle("韩国旅行", limit: 1), "…")
        XCTAssertEqual(monthTaskTitle("韩国旅行", limit: 0), "")
    }

    func testRowHeightReservesFiveTasksAndTheOverflowHint() {
        let previousRowHeight = MonthDayMetrics.dateSize
            + MonthDayMetrics.spacing
            + CGFloat(MonthDayMetrics.visibleTaskCount) * MonthDayMetrics.taskHeight
            + CGFloat(MonthDayMetrics.visibleTaskCount - 1) * MonthDayMetrics.spacing
        let reserved = MonthDayMetrics.overflowHeight + MonthDayMetrics.spacing * 2

        XCTAssertEqual(MonthDayMetrics.visibleTaskCount, 5)
        XCTAssertEqual(
            MonthDayMetrics.rowHeight,
            MonthDayMetrics.stackedHeight(taskRows: 5, includesOverflow: true)
        )
        XCTAssertEqual(MonthDayMetrics.rowHeight, previousRowHeight + reserved)
        XCTAssertEqual(MonthDayMetrics.rowHeight, 136)
        XCTAssertGreaterThan(
            MonthDayMetrics.rowHeight,
            MonthDayMetrics.stackedHeight(taskRows: 5, includesOverflow: false)
        )
    }

    func testColumnMetricsAreTighterAndSharedWithTheWeekdayHeader() {
        XCTAssertEqual(MonthDayMetrics.columnSpacing, 1)
        XCTAssertEqual(MonthDayMetrics.rowSpacing, 1)
        XCTAssertEqual(MonthDayMetrics.cellHorizontalPadding, 1)
        XCTAssertEqual(MonthDayMetrics.horizontalInset, 6)
        XCTAssertLessThan(MonthDayMetrics.columnSpacing, 2)
        XCTAssertLessThan(MonthDayMetrics.cellHorizontalPadding, 2)
    }
}
