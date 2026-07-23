import XCTest

final class TimiaUITests: XCTestCase {
    func testAppLaunchesIntoAuthentication() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()
        XCTAssertTrue(app.staticTexts["Timia"].waitForExistence(timeout: 5))
    }
}
