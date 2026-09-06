import XCTest
@testable import Timia

final class RescheduleMathTests: XCTestCase {
    func testSnapToHour() {
        XCTAssertEqual(RescheduleMath.snapToHour(61), 60)
        XCTAssertEqual(RescheduleMath.snapToHour(89), 60)
        XCTAssertEqual(RescheduleMath.snapToHour(90), 120)
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
