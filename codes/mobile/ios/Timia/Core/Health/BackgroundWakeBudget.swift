import Foundation

/// Shared wall-clock budget for one HealthKit or BGAppRefresh wake.
/// Health samples and workouts both stop when this window ends.
enum BackgroundWakeBudget {
    /// Leave a few seconds of the ~30s background window for teardown.
    static let wakeSeconds: TimeInterval = 25
    /// When workouts still have to run, health may use at most this many seconds.
    static let maxHealthSecondsWhenWorkoutPending: TimeInterval = 15
    /// When both pipelines are pending, health gets this fraction of the time still left, capped above.
    static let healthShareWhenWorkoutPending: Double = 0.6
    /// Do not start another export or upload slice below this.
    static let minimumSlice: TimeInterval = 1

    static func wakeDeadline(now: Date = Date()) -> Date {
        now.addingTimeInterval(wakeSeconds)
    }

    static func healthDeadline(
        wakeDeadline: Date,
        workoutAlsoPending: Bool,
        now: Date = Date()
    ) -> Date {
        let remaining = max(0, wakeDeadline.timeIntervalSince(now))
        let cap: TimeInterval
        if workoutAlsoPending {
            cap = min(maxHealthSecondsWhenWorkoutPending, remaining * healthShareWhenWorkoutPending)
        } else {
            cap = remaining
        }
        return now.addingTimeInterval(max(0, cap))
    }

    static func drainBudget(until deadline: Date, now: Date = Date()) -> HealthSyncDrainBudget {
        HealthSyncDrainBudget(
            maxBatches: 200,
            maxDuration: max(0, deadline.timeIntervalSince(now))
        )
    }

    static func shouldStartSlice(deadline: Date, now: Date = Date()) -> Bool {
        deadline.timeIntervalSince(now) >= minimumSlice
    }
}

/// Mutable expiration flag shared by a background task handler and the sync work.
final class BackgroundSyncGate: @unchecked Sendable {
    private let lock = NSLock()
    private var deadline: Date
    private var cancelled = false

    init(now: Date = Date(), window: TimeInterval = BackgroundWakeBudget.wakeSeconds) {
        deadline = now.addingTimeInterval(window)
    }

    var wakeDeadline: Date {
        lock.lock()
        defer { lock.unlock() }
        return deadline
    }

    var isExpired: Bool {
        lock.lock()
        defer { lock.unlock() }
        if cancelled { return true }
        return Date() >= deadline
    }

    func expire() {
        lock.lock()
        cancelled = true
        deadline = Date()
        lock.unlock()
    }
}
