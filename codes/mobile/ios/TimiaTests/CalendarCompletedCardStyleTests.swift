import XCTest
@testable import Timia

final class CalendarCompletedCardStyleTests: XCTestCase {
    func testDesaturateAmountZeroKeepsOriginalHex() {
        XCTAssertEqual(desaturateHex("#3B82F6", amount: 0), "#3B82F6")
    }

    func testDesaturateAmountOneProducesGray() throws {
        let value = desaturateHex("#EF4444", amount: 1)
        let rgb = try XCTUnwrap(hexRGB(value))
        XCTAssertEqual(rgb.red, rgb.green)
        XCTAssertEqual(rgb.green, rgb.blue)
    }

    func testDesaturateReducesChannelSpreadOnPriorityBlue() throws {
        let original = try XCTUnwrap(hexRGB("#DBEAFE"))
        let settled = try XCTUnwrap(hexRGB(desaturateHex("#DBEAFE", amount: 0.72)))
        let originalSpread = channelSpread(original)
        let settledSpread = channelSpread(settled)
        XCTAssertLessThan(settledSpread, originalSpread)
    }

    func testCalendarTaskCompletedIncludesDoneAndArchived() {
        XCTAssertTrue(isCalendarTaskCompleted("done"))
        XCTAssertTrue(isCalendarTaskCompleted("archived"))
        XCTAssertFalse(isCalendarTaskCompleted("todo"))
        XCTAssertFalse(isCalendarTaskCompleted("doing"))
    }
}

private func hexRGB(_ hex: String) -> (red: Int, green: Int, blue: Int)? {
    let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var parsed: UInt64 = 0
    guard Scanner(string: value).scanHexInt64(&parsed), value.count == 6 else {
        return nil
    }
    return (
        red: Int((parsed >> 16) & 0xFF),
        green: Int((parsed >> 8) & 0xFF),
        blue: Int(parsed & 0xFF)
    )
}

private func channelSpread(_ rgb: (red: Int, green: Int, blue: Int)) -> Int {
    max(rgb.red, rgb.green, rgb.blue) - min(rgb.red, rgb.green, rgb.blue)
}
