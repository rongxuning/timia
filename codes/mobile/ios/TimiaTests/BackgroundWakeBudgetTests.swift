import XCTest
@testable import Timia

final class BackgroundWakeBudgetTests: XCTestCase {
    func testWakeWindowLeavesHeadroomInsideThirtySeconds() {
        XCTAssertEqual(BackgroundWakeBudget.wakeSeconds, 25, accuracy: 0.001)
        XCTAssertLessThan(BackgroundWakeBudget.wakeSeconds, 30)
    }

    func testHealthShareLeavesTimeForWorkouts() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let wake = BackgroundWakeBudget.wakeDeadline(now: now)
        let health = BackgroundWakeBudget.healthDeadline(
            wakeDeadline: wake,
            workoutAlsoPending: true,
            now: now
        )

        XCTAssertEqual(health.timeIntervalSince(now), 15, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(wake.timeIntervalSince(health), 9)
    }

    func testHealthUsesTheFullWindowWhenWorkoutsAreIdle() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let wake = BackgroundWakeBudget.wakeDeadline(now: now)
        let health = BackgroundWakeBudget.healthDeadline(
            wakeDeadline: wake,
            workoutAlsoPending: false,
            now: now
        )

        XCTAssertEqual(health.timeIntervalSince(wake), 0, accuracy: 0.001)
    }

    func testHealthShareShrinksWithRemainingTime() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        for remaining in [25.0, 20.0, 10.0, 4.0] {
            let wake = now.addingTimeInterval(remaining)
            let health = BackgroundWakeBudget.healthDeadline(
                wakeDeadline: wake,
                workoutAlsoPending: true,
                now: now
            )
            let healthSlice = health.timeIntervalSince(now)
            XCTAssertLessThanOrEqual(
                healthSlice,
                BackgroundWakeBudget.maxHealthSecondsWhenWorkoutPending + 0.001
            )
            XCTAssertLessThanOrEqual(
                healthSlice,
                remaining * BackgroundWakeBudget.healthShareWhenWorkoutPending + 0.001
            )
            XCTAssertLessThanOrEqual(health, wake)
        }
    }

    func testSliceDoesNotStartInsideTheMinimum() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertFalse(
            BackgroundWakeBudget.shouldStartSlice(deadline: now.addingTimeInterval(0.2), now: now)
        )
        XCTAssertTrue(
            BackgroundWakeBudget.shouldStartSlice(deadline: now.addingTimeInterval(2), now: now)
        )
        let budget = BackgroundWakeBudget.drainBudget(until: now.addingTimeInterval(12), now: now)
        XCTAssertEqual(budget.maxDuration, 12, accuracy: 0.001)
        XCTAssertEqual(budget.maxBatches, 200)
    }

    func testExpiredGateStopsFurtherSlices() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let gate = BackgroundSyncGate(now: now, window: 25)
        XCTAssertFalse(gate.isExpired)
        XCTAssertTrue(BackgroundWakeBudget.shouldStartSlice(deadline: gate.wakeDeadline, now: now))
        gate.expire()
        XCTAssertTrue(gate.isExpired)
        XCTAssertFalse(BackgroundWakeBudget.shouldStartSlice(deadline: gate.wakeDeadline, now: now))
    }

    func testBackgroundWorkoutLookbackStaysShort() {
        XCTAssertEqual(WorkoutSyncService.backgroundLookbackDays, 2)
        XCTAssertEqual(
            WorkoutSyncService.backgroundLookbackDays,
            HealthSyncService.backgroundLookbackDays
        )
        XCTAssertLessThan(
            WorkoutSyncService.backgroundLookbackDays,
            WorkoutSyncService.firstLookbackDays
        )
    }

    func testAppRefreshIdentifierMatchesInfoPlistContract() {
        XCTAssertEqual(HealthBackgroundRefresh.identifier, "online.timia.ios.health-refresh")
    }
}
