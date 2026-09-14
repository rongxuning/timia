import XCTest
@testable import Timia

final class YearMonthGridTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.firstWeekday = 1
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }

    func testEveryMonthUsesFixedSixBySevenGrid() {
        for year in [2026, 2027] {
            for month in 1...12 {
                let cells = yearMonthGridCells(year: year, month: month, calendar: calendar)
                XCTAssertEqual(
                    cells.count,
                    YearMonthGrid.cellCount,
                    "\(year)-\(month) must occupy a 6x7 grid"
                )
                XCTAssertEqual(cells.map(\.index), Array(0..<YearMonthGrid.cellCount))
            }
        }
    }

    func testFourWeekFebruaryStillPadsToSixWeeks() {
        // 2026-02-01 is Sunday, 28 days → 4 visible weeks, 2 trailing blank weeks.
        let cells = yearMonthGridCells(year: 2026, month: 2, calendar: calendar)
        XCTAssertEqual(inMonthDayNumbers(cells), Array(1...28))
        XCTAssertEqual(cells.prefix(28).allSatisfy(\.inMonth), true)
        XCTAssertEqual(cells.suffix(14).allSatisfy { !$0.inMonth }, true)
    }

    func testSixWeekAugustFillsTheSameGrid() {
        // 2026-08-01 is Saturday, 31 days → 6 leading blanks + 31 days + 5 trailing.
        let cells = yearMonthGridCells(year: 2026, month: 8, calendar: calendar)
        XCTAssertEqual(cells.prefix(6).allSatisfy { !$0.inMonth }, true)
        XCTAssertEqual(inMonthDayNumbers(cells), Array(1...31))
        XCTAssertEqual(cells.suffix(5).allSatisfy { !$0.inMonth }, true)
    }

    func testMissingHeatmapDataStillRendersInMonthDays() {
        let cells = yearMonthGridCells(year: 2027, month: 1, calendar: calendar)
        XCTAssertEqual(inMonthDayNumbers(cells), Array(1...31))
        XCTAssertTrue(cells.filter(\.inMonth).allSatisfy { $0.taskCount == 0 })
    }

    func testTaskCountsAttachToMatchingDayKeys() {
        let cells = yearMonthGridCells(
            year: 2026,
            month: 6,
            taskCountByDayKey: [
                "2026-06-01": 2,
                "2026-06-15": 4,
            ],
            calendar: calendar
        )

        XCTAssertEqual(cells.first(where: { $0.dayNumber == 1 })?.taskCount, 2)
        XCTAssertEqual(cells.first(where: { $0.dayNumber == 15 })?.taskCount, 4)
        XCTAssertEqual(cells.first(where: { $0.dayNumber == 2 })?.taskCount, 0)
    }

    func testHeatmapAspectRatioIsSharedByEveryMonthCard() {
        let ratio = YearMonthGrid.heatmapAspectRatio()
        XCTAssertGreaterThan(ratio, 1)
        XCTAssertEqual(YearMonthGrid.heatmapAspectRatio(cellSide: 8), ratio, accuracy: 0.02)
        XCTAssertEqual(YearMonthGrid.heatmapAspectRatio(cellSide: 14), ratio, accuracy: 0.02)
    }

    func testInMonthCellCountMatchesDaysInMonth() {
        for month in 1...12 {
            let cells = yearMonthGridCells(year: 2026, month: month, calendar: calendar)
            let expected = calendar.range(
                of: .day,
                in: .month,
                for: calendar.date(from: DateComponents(year: 2026, month: month, day: 1))!
            )?.count
            XCTAssertEqual(cells.filter(\.inMonth).count, expected)
        }
    }

    private func inMonthDayNumbers(_ cells: [YearMonthGridCell]) -> [Int] {
        cells.compactMap(\.dayNumber)
    }
}
