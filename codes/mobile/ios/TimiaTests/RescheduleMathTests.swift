import XCTest
@testable import Timia

final class RescheduleMathTests: XCTestCase {
    func testSnapToHour() {
        XCTAssertEqual(RescheduleMath.snapToHour(61), 60)
        XCTAssertEqual(RescheduleMath.snapToHour(89), 60)
        XCTAssertEqual(RescheduleMath.snapToHour(90), 120)
    }

    func testSnapToDropTargetUsesFifteenMinutes() {
        XCTAssertEqual(RescheduleMath.dropSnapMinutes, 15)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(0), 0)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(7), 0)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(8), 15)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(22), 15)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(23), 30)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(12 * 60 + 7), 12 * 60)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(12 * 60 + 8), 12 * 60 + 15)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(23 * 60 + 52), 23 * 60 + 45)
        XCTAssertEqual(RescheduleMath.snapToDropTarget(24 * 60), 23 * 60 + 45)
    }

    func testMinuteLabelFormatsHourAndMinute() {
        XCTAssertEqual(RescheduleMath.minuteLabel(0), "00:00")
        XCTAssertEqual(RescheduleMath.minuteLabel(12 * 60 + 45), "12:45")
        XCTAssertEqual(RescheduleMath.minuteLabel(23 * 60 + 45), "23:45")
    }

    func testPreservesDurationAcrossDay() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let start = cal.date(from: DateComponents(year: 2026, month: 9, day: 6, hour: 9))!
        let end = cal.date(from: DateComponents(year: 2026, month: 9, day: 6, hour: 11))!
        let dropDay = cal.date(from: DateComponents(year: 2026, month: 9, day: 7))!
        let result = RescheduleMath.computeNewRange(
            originalStart: start, originalEnd: end, dropDay: dropDay, dropMinutes: 15 * 60, calendar: cal
        )
        XCTAssertEqual(cal.component(.day, from: result.start), 7)
        XCTAssertEqual(cal.component(.hour, from: result.start), 15)
        XCTAssertEqual(result.end.timeIntervalSince(result.start), 2 * 3600)
    }

    func testDefaultDurationWhenEndMissing() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let start = cal.date(from: DateComponents(year: 2026, month: 9, day: 6, hour: 9))!
        let dropDay = cal.date(from: DateComponents(year: 2026, month: 9, day: 6))!
        let result = RescheduleMath.computeNewRange(
            originalStart: start, originalEnd: nil, dropDay: dropDay, dropMinutes: 14 * 60, calendar: cal
        )
        XCTAssertEqual(cal.component(.hour, from: result.start), 14)
        XCTAssertEqual(result.end.timeIntervalSince(result.start), 3600)
    }
}
