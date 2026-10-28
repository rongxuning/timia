import XCTest
@testable import Timia

final class PhoneDisplayTests: XCTestCase {
    func testMaskHidesMiddleOfChineseMobile() {
        XCTAssertEqual(PhoneDisplay.mask("13812345678"), "138****5678")
        XCTAssertEqual(PhoneDisplay.mask("+8613812345678"), "138****5678")
    }

    func testPlaceholderWhenNumberIsTooShort() {
        XCTAssertEqual(PhoneDisplay.mask(""), PhoneDisplay.placeholder)
        XCTAssertEqual(PhoneDisplay.mask("12345"), PhoneDisplay.placeholder)
    }

    func testNormalizeAcceptsLocalAndE164() throws {
        XCTAssertEqual(try PhoneDisplay.normalize("138 1234-5678"), "+8613812345678")
        XCTAssertEqual(try PhoneDisplay.normalize("+8613812345678"), "+8613812345678")
        XCTAssertEqual(try PhoneDisplay.normalize("8613812345678"), "+8613812345678")
    }

    func testNormalizeRejectsShortInput() {
        XCTAssertThrowsError(try PhoneDisplay.normalize("123"))
    }
}
