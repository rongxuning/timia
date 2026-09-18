import XCTest

final class TimiaUITests: XCTestCase {
    func testAppLaunchesIntoAuthentication() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()
        XCTAssertTrue(app.staticTexts["Timia"].waitForExistence(timeout: 5))
    }

    /// Regression for tap-to-speak instant quit (layout feedback / cold mic route).
    /// If the process dies on mic tap, subsequent queries fail — that is the signal.
    func testVoiceMicTapDoesNotTerminateApp() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        addUIInterruptionMonitor(withDescription: "mic-or-speech-permission") { alert in
            let allowLabels = ["允许", "好", "Allow", "OK", "允许麦克风", "允许语音识别"]
            for label in allowLabels where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            if alert.buttons.firstMatch.exists {
                alert.buttons.firstMatch.tap()
                return true
            }
            return false
        }

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()

        let voiceInput = app.buttons["schedule-voice-input"]
        XCTAssertTrue(voiceInput.waitForExistence(timeout: 8))
        voiceInput.tap()
        // Nudge the interruption monitor if a system permission sheet appeared.
        app.tap()

        XCTAssertTrue(
            app.buttons["schedule-voice-input"].waitForExistence(timeout: 4),
            "App terminated or voice control disappeared after mic tap"
        )
        XCTAssertTrue(
            element("schedule-bottom-controls", in: app).waitForExistence(timeout: 2),
            "Bottom bar disappeared after mic tap (possible layout crash)"
        )
        XCTAssertGreaterThan(
            element("schedule-bottom-controls", in: app).frame.midY,
            app.frame.height * 0.75,
            "Bottom bar drifted mid-screen after mic tap"
        )
    }

    func testScheduleRedesignModes() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()

        let voiceInput = app.buttons["schedule-voice-input"]
        XCTAssertTrue(voiceInput.waitForExistence(timeout: 8))
        let bottomControls = element("schedule-bottom-controls", in: app)
        XCTAssertTrue(bottomControls.waitForExistence(timeout: 2))
        // Regression: bar must stay docked near the screen bottom, not float mid-list.
        XCTAssertGreaterThan(
            bottomControls.frame.midY,
            app.frame.height * 0.75,
            "Bottom action bar drifted away from the screen bottom"
        )
        let todoModeButton = app.buttons["Todo 模式"]
        XCTAssertTrue(todoModeButton.waitForExistence(timeout: 2))
        XCTAssertEqual(todoModeButton.frame.midY, voiceInput.frame.midY, accuracy: 6)
        XCTAssertTrue(element("todo-section-todo", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-doing", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-done", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-overdue", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-future", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-undated", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-archived", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-people-filter", in: app).waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["本人负责"].exists)
        XCTAssertTrue(app.buttons["本人参与"].exists)
        XCTAssertTrue(app.buttons["全部"].exists)
        XCTAssertLessThan(
            element("todo-people-filter", in: app).frame.maxY,
            element("todo-section-todo", in: app).frame.minY
        )
        XCTAssertLessThan(
            element("todo-section-done", in: app).frame.minY,
            element("todo-section-overdue", in: app).frame.minY
        )
        XCTAssertLessThan(
            element("todo-section-overdue", in: app).frame.minY,
            element("todo-section-future", in: app).frame.minY
        )
        XCTAssertLessThan(
            element("todo-section-future", in: app).frame.minY,
            element("todo-section-undated", in: app).frame.minY
        )
        XCTAssertLessThan(
            element("todo-section-undated", in: app).frame.minY,
            element("todo-section-archived", in: app).frame.minY
        )
        XCTAssertTrue(app.staticTexts["（截止当天）"].exists)
        XCTAssertTrue(app.staticTexts["（今天之后）"].exists)
        XCTAssertTrue(app.staticTexts["（无时间）"].exists)
        XCTAssertTrue(app.staticTexts["待启动"].exists)
        let peopleFilter = element("todo-people-filter", in: app)
        let filterYBeforeScroll = peopleFilter.frame.minY
        element("todo-section-archived", in: app).swipeUp()
        XCTAssertTrue(peopleFilter.waitForExistence(timeout: 2))
        XCTAssertEqual(
            peopleFilter.frame.minY,
            filterYBeforeScroll,
            accuracy: 2,
            "People filter should stay pinned while the task list scrolls"
        )
        XCTAssertFalse(element("todo-section-today", in: app).exists)
        XCTAssertFalse(element("todo-section-this-week", in: app).exists)
        XCTAssertTrue(app.buttons["calendar-selected-date"].waitForExistence(timeout: 2))
        let todoHeader = app.staticTexts["calendar-header-title"]
        XCTAssertTrue(todoHeader.waitForExistence(timeout: 2))
        let todoHeaderValue = (todoHeader.value as? String) ?? todoHeader.label
        XCTAssertNotNil(todoHeaderValue.range(of: #"^\d{4}年\d{2}月$"#, options: .regularExpression))
        XCTAssertFalse(todoHeaderValue.contains("日"))
        XCTAssertFalse(app.buttons["日"].exists)

        let directCreateButton = app.buttons["新建任务"]
        XCTAssertTrue(directCreateButton.waitForExistence(timeout: 2))
        XCTAssertLessThan(directCreateButton.frame.maxX, voiceInput.frame.minX)
        XCTAssertEqual(directCreateButton.frame.midY, voiceInput.frame.midY, accuracy: 6)
        XCTAssertEqual(directCreateButton.frame.width, 38, accuracy: 2)
        XCTAssertEqual(directCreateButton.frame.height, 38, accuracy: 2)
        directCreateButton.tap()
        XCTAssertTrue(app.navigationBars["新建任务"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["优先级"].exists)
        XCTAssertFalse(app.staticTexts["状态"].exists)
        XCTAssertFalse(app.staticTexts["时间"].exists)
        XCTAssertTrue(app.buttons["低"].exists)
        XCTAssertTrue(app.buttons["待办"].exists)
        app.buttons["取消"].tap()
        XCTAssertTrue(voiceInput.waitForExistence(timeout: 3))

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["新建任务"].waitForExistence(timeout: 2))
        XCTAssertLessThan(app.buttons["新建任务"].frame.maxX, voiceInput.frame.minX)
        XCTAssertTrue(app.buttons["日"].waitForExistence(timeout: 2))
        app.buttons["日"].tap()
        XCTAssertFalse(app.buttons["日"].exists)
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-day", app: app)

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["周"].waitForExistence(timeout: 2))
        app.buttons["周"].tap()
        XCTAssertFalse(app.buttons["日"].exists)
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-week", app: app)

        app.buttons["日历模式"].tap()
        app.buttons["月"].tap()
        XCTAssertFalse(app.buttons["年"].exists)
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-month", app: app)

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["年"].waitForExistence(timeout: 3))
        app.buttons["年"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label ENDSWITH '年'")).firstMatch.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-year", app: app)

        XCTAssertTrue(app.buttons["打开我的页面"].exists)
        XCTAssertTrue(app.buttons["打开空间页面"].exists)
        XCTAssertTrue(app.buttons["Todo 模式"].exists)
        XCTAssertTrue(app.buttons["schedule-voice-input"].exists)
        XCTAssertEqual(app.tabBars.count, 0)

        app.buttons["打开空间页面"].tap()
        XCTAssertTrue(app.navigationBars["空间"].waitForExistence(timeout: 3))
        let workspaceLink = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "打开空间：")
        ).firstMatch
        XCTAssertTrue(workspaceLink.waitForExistence(timeout: 3))
        let workspaceName = String(workspaceLink.label.dropFirst("打开空间：".count))
        workspaceLink.tap()
        XCTAssertTrue(app.navigationBars[workspaceName].waitForExistence(timeout: 3))
        app.navigationBars[workspaceName].buttons.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["空间"].waitForExistence(timeout: 3))
        app.navigationBars["空间"].buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["schedule-voice-input"].waitForExistence(timeout: 3))

        app.buttons["Todo 模式"].tap()
        XCTAssertTrue(app.buttons["日历模式"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["日"].exists)
        XCTAssertTrue(element("todo-section-todo", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-doing", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-done", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-overdue", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-future", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-undated", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-section-archived", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("todo-people-filter", in: app).waitForExistence(timeout: 2))
        XCTAssertFalse(element("todo-section-today", in: app).exists)
        XCTAssertFalse(element("todo-section-this-week", in: app).exists)
        XCTAssertTrue(app.buttons["calendar-selected-date"].waitForExistence(timeout: 2))
        let selectedBefore = app.buttons["calendar-selected-date"].value as? String
        XCTAssertEqual(selectedBefore, dayKey(Date()))
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        element("todo-people-filter", in: app).swipeLeft()
        XCTAssertTrue(waitForValue(dayKey(tomorrow), on: app.buttons["calendar-selected-date"], timeout: 3))
        element("todo-people-filter", in: app).swipeRight()
        XCTAssertTrue(waitForValue(dayKey(Date()), on: app.buttons["calendar-selected-date"], timeout: 3))
        let stripStart = weekStart(of: Date())
        XCTAssertEqual(
            app.descendants(matching: .any)["calendar-header-title"].firstMatch.value as? String,
            dominantMonthTitle(starting: stripStart)
        )
        dragDateStrip(element("week-date-strip", in: app), byDays: 1)
        let shiftedStart = Calendar.current.date(byAdding: .day, value: 1, to: stripStart) ?? stripStart
        let newLastDay = Calendar.current.date(byAdding: .day, value: 6, to: shiftedStart) ?? shiftedStart
        XCTAssertTrue(waitForValue(dayKey(Date()), on: app.buttons["calendar-selected-date"], timeout: 3))
        XCTAssertTrue(element("calendar-date-\(dayKey(newLastDay))", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(waitForValue(
            dominantMonthTitle(starting: shiftedStart),
            on: app.descendants(matching: .any)["calendar-header-title"].firstMatch,
            timeout: 3
        ))
        Thread.sleep(forTimeInterval: 0.4)
        attachScreenshot(named: "schedule-todo", app: app)

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["日"].waitForExistence(timeout: 2))
        app.buttons["日"].tap()
        XCTAssertFalse(app.buttons["日"].exists)
        Thread.sleep(forTimeInterval: 0.35)
        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["日"].waitForExistence(timeout: 2))
    }

    func testTodoSwipePagesDateStripPastRightEdge() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.buttons["schedule-voice-input"].waitForExistence(timeout: 8))
        XCTAssertTrue(element("todo-people-filter", in: app).waitForExistence(timeout: 2))

        let strip = element("week-date-strip", in: app)
        XCTAssertTrue(strip.waitForExistence(timeout: 3))
        strip.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["calendar-selected-date"].waitForExistence(timeout: 2))

        let lastVisibleKey = app.buttons["calendar-selected-date"].value as? String
        XCTAssertNotNil(lastVisibleKey)
        let lastVisible = dateFromDayKey(lastVisibleKey ?? "")
        XCTAssertNotNil(lastVisible)
        let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: lastVisible ?? Date()) ?? Date()
        let nextKey = dayKey(nextDay)

        element("todo-people-filter", in: app).swipeLeft()
        XCTAssertTrue(waitForValue(nextKey, on: app.buttons["calendar-selected-date"], timeout: 3))

        // New cycle must pin the selected day to the leading edge, not leave it trailing.
        let selected = app.buttons["calendar-selected-date"]
        XCTAssertEqual(selected.frame.minX, strip.frame.minX, accuracy: 16)

        let newLastDay = Calendar.current.date(byAdding: .day, value: 6, to: nextDay) ?? nextDay
        XCTAssertTrue(element("calendar-date-\(dayKey(newLastDay))", in: app).waitForExistence(timeout: 3))

        element("todo-people-filter", in: app).swipeRight()
        XCTAssertTrue(waitForValue(lastVisibleKey ?? "", on: app.buttons["calendar-selected-date"], timeout: 3))
        XCTAssertEqual(selected.frame.maxX, strip.frame.maxX, accuracy: 16)
    }

    func testCalendarBlankCreateAndPagedRangeNavigation() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.buttons["schedule-voice-input"].waitForExistence(timeout: 8))

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["日"].waitForExistence(timeout: 2))
        app.buttons["日"].tap()
        XCTAssertTrue(element("calendar-day-timeline", in: app).waitForExistence(timeout: 4))
        XCTAssertTrue(element("week-date-strip", in: app).waitForExistence(timeout: 2))
        let selectedBefore = app.buttons["calendar-selected-date"].value as? String
        XCTAssertEqual(selectedBefore, dayKey(Date()))
        let stripStart = weekStart(of: Date())
        XCTAssertEqual(
            app.descendants(matching: .any)["calendar-header-title"].firstMatch.value as? String,
            dominantMonthTitle(starting: stripStart)
        )
        dragDateStrip(element("week-date-strip", in: app), byDays: 1)
        let shiftedStart = Calendar.current.date(byAdding: .day, value: 1, to: stripStart) ?? stripStart
        let newLastDay = Calendar.current.date(byAdding: .day, value: 6, to: shiftedStart) ?? shiftedStart
        XCTAssertTrue(waitForValue(dayKey(Date()), on: app.buttons["calendar-selected-date"], timeout: 3))
        XCTAssertTrue(element("calendar-date-\(dayKey(newLastDay))", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(waitForValue(
            dominantMonthTitle(starting: shiftedStart),
            on: app.descendants(matching: .any)["calendar-header-title"].firstMatch,
            timeout: 3
        ))

        // Longer drag should advance the visible window by multiple days in one gesture.
        dragDateStrip(element("week-date-strip", in: app), byDays: 3.2)
        let atLeastStart = Calendar.current.date(byAdding: .day, value: 2, to: shiftedStart) ?? shiftedStart
        let atLeastLastDay = Calendar.current.date(byAdding: .day, value: 6, to: atLeastStart) ?? atLeastStart
        XCTAssertTrue(waitForValue(dayKey(Date()), on: app.buttons["calendar-selected-date"], timeout: 3))
        XCTAssertTrue(element("calendar-date-\(dayKey(atLeastLastDay))", in: app).waitForExistence(timeout: 3))

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.70)).tap()
        XCTAssertTrue(app.navigationBars["新建任务"].waitForExistence(timeout: 3))
        app.buttons["取消"].tap()

        let dayTimeline = element("calendar-day-timeline", in: app)
        let todayKey = dayKey(Date())
        let previousDay = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
        let previousDayKey = dayKey(previousDay)
        dayTimeline.swipeUp()
        dayTimeline.swipeDown()
        XCTAssertTrue(waitForValue(todayKey, on: app.buttons["calendar-selected-date"], timeout: 3))
        XCTAssertTrue(element("calendar-day-label-\(todayKey)", in: app).waitForExistence(timeout: 3))
        for _ in 0..<4 {
            dragTimelinePage(dayTimeline, goingToNext: false)
            if (app.buttons["calendar-selected-date"].value as? String) == previousDayKey { break }
        }
        XCTAssertTrue(waitForValue(previousDayKey, on: app.buttons["calendar-selected-date"], timeout: 4))
        XCTAssertTrue(element("calendar-day-label-\(previousDayKey)", in: app).waitForExistence(timeout: 3))
        attachScreenshot(named: "schedule-day-boundary-spacing", app: app)
        for _ in 0..<4 {
            dragTimelinePage(dayTimeline, goingToNext: true)
            if (app.buttons["calendar-selected-date"].value as? String) == todayKey { break }
        }
        XCTAssertTrue(waitForValue(todayKey, on: app.buttons["calendar-selected-date"], timeout: 4))
        XCTAssertTrue(element("calendar-day-label-\(todayKey)", in: app).waitForExistence(timeout: 3))

        let visibleStripStart = weekStart(of: Date())
        let dayBeforeStrip = Calendar.current.date(byAdding: .day, value: -1, to: visibleStripStart) ?? visibleStripStart
        let previousWeekStart = Calendar.current.date(byAdding: .day, value: -7, to: visibleStripStart) ?? visibleStripStart
        for _ in 0..<10 {
            dragTimelinePage(dayTimeline, goingToNext: false)
            if (app.buttons["calendar-selected-date"].value as? String) == dayKey(dayBeforeStrip) { break }
        }
        XCTAssertTrue(waitForValue(dayKey(dayBeforeStrip), on: app.buttons["calendar-selected-date"], timeout: 4))
        XCTAssertTrue(element("calendar-date-\(dayKey(previousWeekStart))", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("calendar-day-label-\(dayKey(dayBeforeStrip))", in: app).waitForExistence(timeout: 3))
        for _ in 0..<12 {
            dragTimelinePage(dayTimeline, goingToNext: true)
            if (app.buttons["calendar-selected-date"].value as? String) == todayKey { break }
        }
        XCTAssertTrue(waitForValue(todayKey, on: app.buttons["calendar-selected-date"], timeout: 4))
        Thread.sleep(forTimeInterval: 0.5)

        app.buttons["日历模式"].tap()
        app.buttons["周"].tap()
        XCTAssertTrue(element("calendar-week-timeline", in: app).waitForExistence(timeout: 3))
        let todayInWeekHeader = element("calendar-week-date-\(todayKey)", in: app)
        XCTAssertTrue(todayInWeekHeader.waitForExistence(timeout: 3))
        XCTAssertEqual(todayInWeekHeader.value as? String, "今天")
        XCTAssertFalse(app.buttons["calendar-week-date-\(todayKey)"].exists)
        let weekStripStart = weekStart(of: Date())
        XCTAssertEqual(
            app.descendants(matching: .any)["calendar-header-title"].firstMatch.value as? String,
            dominantMonthTitle(starting: weekStripStart)
        )
        element("calendar-week-date-strip", in: app).swipeLeft()
        let nextWeekStart = Calendar.current.date(byAdding: .day, value: 7, to: weekStripStart) ?? weekStripStart
        let nextWeekLast = Calendar.current.date(byAdding: .day, value: 6, to: nextWeekStart) ?? nextWeekStart
        let nextWeekSameDay = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        XCTAssertTrue(element("calendar-week-date-\(dayKey(nextWeekLast))", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("calendar-week-date-\(dayKey(nextWeekSameDay))", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("calendar-week-date-\(dayKey(nextWeekSameDay))", in: app).isSelected)
        XCTAssertTrue(element("calendar-week-label-\(dayKey(nextWeekStart))", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(waitForValue(
            dominantMonthTitle(starting: nextWeekStart),
            on: app.descendants(matching: .any)["calendar-header-title"].firstMatch,
            timeout: 3
        ))
        element("calendar-week-date-strip", in: app).swipeRight()
        XCTAssertTrue(todayInWeekHeader.waitForExistence(timeout: 3))
        XCTAssertTrue(todayInWeekHeader.isSelected)
        XCTAssertTrue(element("calendar-week-label-\(dayKey(weekStripStart))", in: app).waitForExistence(timeout: 3))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.90, dy: 0.70)).tap()
        XCTAssertTrue(app.navigationBars["新建任务"].waitForExistence(timeout: 3))
        app.buttons["取消"].tap()

        let weekTimeline = element("calendar-week-timeline", in: app)
        let currentWeekKey = dayKey(weekStripStart)
        weekTimeline.swipeUp()
        weekTimeline.swipeDown()
        XCTAssertTrue(element("calendar-week-label-\(currentWeekKey)", in: app).waitForExistence(timeout: 3))
        dragTimelinePage(weekTimeline, goingToNext: true)
        let weekStrip = element("calendar-week-date-strip", in: app)
        XCTAssertTrue(
            waitUntilVisibleInContainer(
                "calendar-week-date-\(dayKey(nextWeekLast))",
                container: weekStrip,
                app: app,
                timeout: 3
            )
        )
        XCTAssertTrue(element("calendar-week-date-\(dayKey(nextWeekSameDay))", in: app).isSelected)
        XCTAssertFalse(
            isVisibleInContainer(
                "calendar-week-date-\(dayKey(weekStripStart))",
                container: weekStrip,
                app: app
            )
        )
        dragTimelinePage(weekTimeline, goingToNext: false)
        XCTAssertTrue(todayInWeekHeader.waitForExistence(timeout: 3))
        XCTAssertTrue(todayInWeekHeader.isSelected)
        XCTAssertFalse(element("calendar-week-label-2026-08-02", in: app).exists)
        for _ in 0..<10 {
            dragTimelinePage(weekTimeline, goingToNext: false)
            if element("calendar-week-label-2026-08-02", in: app).exists { break }
        }
        XCTAssertTrue(app.staticTexts["2026年08月"].waitForExistence(timeout: 3))
        XCTAssertTrue(element("calendar-week-label-2026-08-02", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["2026年第31周"].exists)
        attachScreenshot(named: "schedule-week-boundary-spacing", app: app)
        Thread.sleep(forTimeInterval: 0.5)

        app.buttons["日历模式"].tap()
        app.buttons["月"].tap()
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

        app.buttons["日历模式"].tap()
        app.buttons["年"].tap()
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

    func testWeekAllDayTasksAlignWithDateColumns() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.buttons["schedule-voice-input"].waitForExistence(timeout: 8))

        app.buttons["日历模式"].tap()
        app.buttons["周"].tap()
        XCTAssertTrue(element("calendar-week-timeline", in: app).waitForExistence(timeout: 3))

        let todayKey = dayKey(Date())
        let todayHeader = element("calendar-week-date-\(todayKey)", in: app)
        let todayAllDayColumn = element("calendar-week-all-day-\(todayKey)", in: app)
        XCTAssertTrue(todayHeader.waitForExistence(timeout: 3))
        XCTAssertTrue(todayAllDayColumn.waitForExistence(timeout: 3))
        XCTAssertEqual(todayAllDayColumn.frame.midX, todayHeader.frame.midX, accuracy: 4)
    }

    func testCalendarIdleCollapseToggleDoesNotFreeze() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing")
        app.launch()

        let login = app.buttons["登录"]
        XCTAssertTrue(login.waitForExistence(timeout: 5))
        login.tap()
        XCTAssertTrue(app.buttons["schedule-voice-input"].waitForExistence(timeout: 8))

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["日"].waitForExistence(timeout: 2))
        app.buttons["日"].tap()
        XCTAssertTrue(element("calendar-day-timeline", in: app).waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["全天"].waitForExistence(timeout: 2))

        let toggle = app.buttons["calendar-idle-collapse-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(toggle.frame.minY, app.staticTexts["全天"].frame.minY)
        XCTAssertFalse(app.staticTexts["折叠空闲"].exists)
        XCTAssertFalse(app.staticTexts["展开全部"].exists)
        XCTAssertFalse(app.buttons["折叠空闲"].exists)
        XCTAssertFalse(app.buttons["展开全部"].exists)

        toggle.tap()
        XCTAssertTrue(waitForHittable(toggle, timeout: 3))
        XCTAssertTrue(element("calendar-day-timeline", in: app).waitForExistence(timeout: 3))
        toggle.tap()
        XCTAssertTrue(waitForHittable(toggle, timeout: 3))
        XCTAssertTrue(element("calendar-day-timeline", in: app).waitForExistence(timeout: 3))
        attachScreenshot(named: "schedule-day-idle-collapse", app: app)

        app.buttons["日历模式"].tap()
        XCTAssertTrue(app.buttons["周"].waitForExistence(timeout: 2))
        app.buttons["周"].tap()
        XCTAssertTrue(element("calendar-week-timeline", in: app).waitForExistence(timeout: 4))
        XCTAssertTrue(toggle.waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["折叠空闲"].exists)
        XCTAssertFalse(app.staticTexts["展开全部"].exists)

        toggle.tap()
        XCTAssertTrue(waitForHittable(toggle, timeout: 3))
        XCTAssertTrue(element("calendar-week-timeline", in: app).waitForExistence(timeout: 3))
        toggle.tap()
        XCTAssertTrue(waitForHittable(toggle, timeout: 3))
        XCTAssertTrue(element("calendar-week-timeline", in: app).waitForExistence(timeout: 3))
        attachScreenshot(named: "schedule-week-idle-collapse", app: app)
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    /// Horizontal page swipe on the day/week timeline (left = later dates).
    private func dragTimelinePage(_ timeline: XCUIElement, goingToNext: Bool) {
        let start = timeline.coordinate(withNormalizedOffset: CGVector(dx: goingToNext ? 0.86 : 0.14, dy: 0.58))
        let end = timeline.coordinate(withNormalizedOffset: CGVector(dx: goingToNext ? 0.14 : 0.86, dy: 0.58))
        start.press(forDuration: 0.12, thenDragTo: end)
    }

    /// Drag the date strip by approximately `days` day-widths (positive = later dates).
    private func dragDateStrip(_ strip: XCUIElement, byDays days: CGFloat) {
        // Overshoot slightly so view-aligned snap commits past the halfway point.
        let distance = days + 0.15
        let start = strip.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5))
        let endX = max(0.05, 0.92 - distance / 7.0)
        let end = strip.coordinate(withNormalizedOffset: CGVector(dx: endX, dy: 0.5))
        start.press(forDuration: 0.12, thenDragTo: end)
    }

    private func isVisibleInContainer(
        _ identifier: String,
        container: XCUIElement,
        app: XCUIApplication
    ) -> Bool {
        let target = element(identifier, in: app)
        guard target.exists else { return false }
        return container.frame.intersects(target.frame)
    }

    private func waitUntilVisibleInContainer(
        _ identifier: String,
        container: XCUIElement,
        app: XCUIApplication,
        timeout: TimeInterval
    ) -> Bool {
        let predicate = NSPredicate { _, _ in
            self.isVisibleInContainer(identifier, container: container, app: app)
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: nil)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func waitForHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "isHittable == true")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func waitForValue(_ value: String, on element: XCUIElement, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "value == %@", value)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func weekStart(of date: Date) -> Date {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: date)
        return calendar.date(
            byAdding: .day,
            value: -(weekday - 1),
            to: calendar.startOfDay(for: date)
        ) ?? date
    }

    private func dominantMonthTitle(starting start: Date) -> String {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: start)
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
        var counts: [String: Int] = [:]
        for day in days {
            let components = calendar.dateComponents([.year, .month], from: day)
            let key = String(format: "%04d年%02d月", components.year ?? 0, components.month ?? 0)
            counts[key, default: 0] += 1
        }
        return counts.max(by: { $0.value < $1.value })?.key ?? ""
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

    private func dateFromDayKey(_ key: String) -> Date? {
        let parts = key.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else { return nil }
        return Calendar.current.date(from: DateComponents(year: year, month: month, day: day))
    }

    private func attachScreenshot(named name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
