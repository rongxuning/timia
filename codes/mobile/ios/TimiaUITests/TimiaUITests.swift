import XCTest

final class TimiaUITests: XCTestCase {
    func testAppLaunchesIntoAuthentication() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()
        XCTAssertTrue(app.staticTexts["Timia"].waitForExistence(timeout: 5))
    }

    func testScheduleRedesignModes() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()

        let input = app.textFields["用自然语言添加任务…"]
        XCTAssertTrue(input.waitForExistence(timeout: 8))
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-day", app: app)

        app.buttons["W"].tap()
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-week", app: app)

        app.buttons["M"].tap()
        XCTAssertTrue(app.buttons["Y"].waitForExistence(timeout: 3))
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-month", app: app)

        app.buttons["Y"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label ENDSWITH '年'")).firstMatch.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-year", app: app)

        XCTAssertTrue(app.buttons["打开我的页面"].exists)
        XCTAssertTrue(app.buttons["打开空间页面"].exists)
        XCTAssertTrue(app.buttons["Todo 模式"].exists)
        XCTAssertFalse(app.images["mic"].exists)
        XCTAssertEqual(app.tabBars.count, 0)

        app.buttons["打开空间页面"].tap()
        XCTAssertTrue(app.navigationBars["空间"].waitForExistence(timeout: 3))
        app.navigationBars["空间"].buttons.firstMatch.tap()
        XCTAssertTrue(input.waitForExistence(timeout: 3))

        app.buttons["Todo 模式"].tap()
        XCTAssertTrue(app.buttons["日历模式"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["D"].exists)
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-todo", app: app)

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["D"].waitForExistence(timeout: 2))
    }

    func testCalendarBlankCreateAndVerticalRangeNavigation() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.textFields["用自然语言添加任务…"].waitForExistence(timeout: 8))

        XCTAssertTrue(element("calendar-day-timeline", in: app).waitForExistence(timeout: 4))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.70)).tap()
        XCTAssertTrue(app.navigationBars["新建任务"].waitForExistence(timeout: 3))
        app.buttons["取消"].tap()

        let dayTimeline = element("calendar-day-timeline", in: app)
        let todayKey = dayKey(Date())
        let previousDay = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
        let previousDayKey = dayKey(previousDay)
        for _ in 0..<10 {
            dayTimeline.swipeDown()
            if (app.buttons["calendar-selected-date"].value as? String) == previousDayKey { break }
        }
        XCTAssertTrue(waitForValue(previousDayKey, on: app.buttons["calendar-selected-date"], timeout: 4))
        XCTAssertTrue(element("calendar-day-label-\(previousDayKey)", in: app).waitForExistence(timeout: 3))
        for _ in 0..<10 {
            dayTimeline.swipeUp()
            if (app.buttons["calendar-selected-date"].value as? String) == todayKey { break }
        }
        XCTAssertTrue(waitForValue(todayKey, on: app.buttons["calendar-selected-date"], timeout: 4))
        XCTAssertTrue(element("calendar-day-label-\(todayKey)", in: app).waitForExistence(timeout: 3))
        Thread.sleep(forTimeInterval: 0.5)

        app.buttons["W"].tap()
        XCTAssertTrue(element("calendar-week-timeline", in: app).waitForExistence(timeout: 3))
        let todayInWeekHeader = element("calendar-week-date-\(todayKey)", in: app)
        XCTAssertTrue(todayInWeekHeader.waitForExistence(timeout: 3))
        XCTAssertEqual(todayInWeekHeader.value as? String, "今天")
        XCTAssertFalse(app.buttons["calendar-week-date-\(todayKey)"].exists)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.90, dy: 0.70)).tap()
        XCTAssertTrue(app.navigationBars["新建任务"].waitForExistence(timeout: 3))
        app.buttons["取消"].tap()

        for _ in 0..<5 {
            element("calendar-week-timeline", in: app).swipeUp()
            if app.staticTexts["2026年08月"].exists { break }
        }
        XCTAssertTrue(app.staticTexts["2026年08月"].waitForExistence(timeout: 3))
        XCTAssertTrue(element("calendar-week-label-2026-08-02", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["2026年第31周"].exists)
        Thread.sleep(forTimeInterval: 0.5)

        app.buttons["M"].tap()
        let monthGrid = element("calendar-month-grid", in: app)
        let calendarHeader = app.staticTexts["calendar-header-title"]
        XCTAssertTrue(monthGrid.waitForExistence(timeout: 3))
        XCTAssertTrue(waitForValue("2026年07月", on: calendarHeader, timeout: 3))
        XCTAssertTrue(element("calendar-month-label-2026-07", in: app).waitForExistence(timeout: 6))
        XCTAssertEqual(
            element("calendar-month-date-\(todayKey)", in: app).value as? String,
            "今天"
        )
        XCTAssertEqual(
            element("calendar-month-date-2026-07-01", in: app).value as? String,
            "2026-07-01"
        )
        let emptyMonthDay = element("calendar-month-create-2026-07-05", in: app)
        XCTAssertTrue(emptyMonthDay.waitForExistence(timeout: 6))
        emptyMonthDay.tap()
        XCTAssertTrue(app.navigationBars["新建任务"].waitForExistence(timeout: 3))
        app.buttons["取消"].tap()

        for _ in 0..<5 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62))
                .press(
                    forDuration: 0.05,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.24))
                )
            if (calendarHeader.value as? String) == "2026年08月" { break }
        }
        XCTAssertTrue(waitForValue("2026年08月", on: calendarHeader, timeout: 3))
        XCTAssertTrue(element("calendar-month-label-2026-08", in: app).waitForExistence(timeout: 3))
        XCTAssertEqual(
            element("calendar-month-date-2026-08-01", in: app).value as? String,
            "2026-08-01"
        )

        app.buttons["Y"].tap()
        let yearGrid = element("calendar-year-grid", in: app)
        let yearHeader = app.staticTexts["calendar-header-title"]
        XCTAssertTrue(yearGrid.waitForExistence(timeout: 3))
        XCTAssertTrue(waitForValue("2026年", on: yearHeader, timeout: 8))
        for _ in 0..<8 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62))
                .press(
                    forDuration: 0.05,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.24))
                )
            if (yearHeader.value as? String) == "2027年" { break }
        }
        XCTAssertTrue(waitForValue("2027年", on: yearHeader, timeout: 3))
        XCTAssertTrue(element("calendar-year-label-2027", in: app).waitForExistence(timeout: 3))
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func waitForValue(_ value: String, on element: XCUIElement, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "value == %@", value)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func dayKey(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    private func attachScreenshot(named name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
