import XCTest
@testable import Timia

final class IdleCollapsePlannerTests: XCTestCase {
    func testBusyMergesOverlap() {
        let busy = IdleCollapsePlanner.busyRanges(from: [
            (startMinutes: 9 * 60, durationMinutes: 90),
            (startMinutes: 10 * 60, durationMinutes: 60),
        ])
        XCTAssertEqual(busy, [MinuteRange(start: 540, end: 660)])
    }

    func testCollapsibleOnlyWhenAtLeastTwoHours() {
        let idle = [
            MinuteRange(start: 0, end: 90),
            MinuteRange(start: 200, end: 400),
        ]
        let gaps = IdleCollapsePlanner.collapsibleIdles(idle: idle, thresholdMinutes: 120)
        XCTAssertEqual(gaps, [MinuteRange(start: 200, end: 400)])
    }

    func testProtectNowSplitsContainingIdle() {
        let idles = [MinuteRange(start: 0, end: 12 * 60)]
        let protected = IdleCollapsePlanner.protectNow(idles: idles, nowMinutes: 3 * 60, padMinutes: 30)
        // 02:30–03:30 不得落在可折叠段内
        XCTAssertFalse(protected.contains { $0.start <= 150 && $0.end >= 210 && ($0.end - $0.start) >= 120 })
    }

    func testWeekUnionBusy() {
        let mon = [MinuteRange(start: 9 * 60, end: 10 * 60)]
        let wed = [MinuteRange(start: 14 * 60, end: 15 * 60)]
        let union = IdleCollapsePlanner.unionBusy([mon, [], wed, [], [], [], []])
        XCTAssertEqual(union, [
            MinuteRange(start: 540, end: 600),
            MinuteRange(start: 840, end: 900),
        ])
    }
}
