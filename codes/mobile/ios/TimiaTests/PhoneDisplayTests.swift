import XCTest
@testable import Timia

final class PhoneDisplayTests: XCTestCase {
    func testMaskHidesMiddleOfChineseMobile() {
        XCTAssertEqual(PhoneDisplay.mask("13812345678"), "138****5678" as String?)
        XCTAssertEqual(PhoneDisplay.mask("+8613812345678"), "138****5678" as String?)
        XCTAssertEqual(PhoneDisplay.mask("138-1234-5678"), "138****5678" as String?)
    }

    func testShortOrEmptyNumberIsOmitted() {
        XCTAssertNil(PhoneDisplay.mask(""))
        XCTAssertNil(PhoneDisplay.mask("12345"))
        XCTAssertNil(PhoneDisplay.resolvedMask(stored: nil))
        XCTAssertNil(PhoneDisplay.resolvedMask(stored: ""))
        XCTAssertNil(PhoneDisplay.resolvedMask(stored: "123", contactPhones: [(label: "mobile", number: "12")]))
    }

    func testStoredNumberBeatsContactCard() {
        XCTAssertEqual(
            PhoneDisplay.resolvedMask(
                stored: "+8613911112222",
                contactPhones: [(label: "_$!<Mobile>!$_", number: "13812345678")]
            ),
            "139****2222" as String?
        )
    }

    func testContactCardUsedWhenNothingStored() {
        XCTAssertEqual(
            PhoneDisplay.resolvedMask(
                stored: nil,
                contactPhones: [(label: "", number: "138 1234 5678")]
            ),
            "138****5678" as String?
        )
    }

    func testOwnCardPrefersMobileOverHome() {
        XCTAssertEqual(
            PhoneDisplay.preferredNumber(from: [
                (label: "_$!<Home>!$_", number: "01087654321"),
                (label: "_$!<Mobile>!$_", number: "13900001111"),
            ]),
            "13900001111" as String?
        )
        XCTAssertEqual(
            PhoneDisplay.preferredNumber(from: [
                (label: "_$!<iPhone>!$_", number: "13700002222"),
                (label: "_$!<Work>!$_", number: "02112345678"),
            ]),
            "13700002222" as String?
        )
    }

    func testOwnCardSkipsNumbersThatCannotBeMasked() {
        XCTAssertEqual(
            PhoneDisplay.preferredNumber(from: [
                (label: "_$!<Mobile>!$_", number: "123"),
                (label: "_$!<Home>!$_", number: "13700001111"),
            ]),
            "13700001111" as String?
        )
        XCTAssertNil(PhoneDisplay.preferredNumber(from: [(label: "_$!<Mobile>!$_", number: "123")]))
    }

    func testStoredMaskReadsDefaultsAndOmitsMissing() {
        let name = "PhoneDisplayTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        XCTAssertNil(PhoneDisplay.storedMask(defaults: defaults))
        defaults.set("+8613800138000", forKey: PhoneDisplay.storageKey)
        XCTAssertEqual(PhoneDisplay.storedMask(defaults: defaults), "138****8000" as String?)
        defaults.set("12345", forKey: PhoneDisplay.storageKey)
        XCTAssertNil(PhoneDisplay.storedMask(defaults: defaults))
        defaults.removePersistentDomain(forName: name)
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
