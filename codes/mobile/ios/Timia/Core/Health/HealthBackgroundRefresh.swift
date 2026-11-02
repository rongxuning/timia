import BackgroundTasks
import Foundation
import os

/// Secondary wake when HealthKit background delivery stays quiet.
/// Identifier must match `BGTaskSchedulerPermittedIdentifiers` in Info.plist.
enum HealthBackgroundRefresh {
    static let identifier = "online.timia.ios.health-refresh"
    /// Earliest next refresh. iOS still decides whether to launch.
    static let earliestInterval: TimeInterval = 15 * 60

    private static let log = Logger(subsystem: "online.timia.ios", category: "HealthBackgroundRefresh")
    private static let registerLock = NSLock()
    private static var didRegister = false

    /// Call from `didFinishLaunching` before the method returns.
    static func register() {
        registerLock.lock()
        let already = didRegister
        if !already { didRegister = true }
        registerLock.unlock()
        guard !already else { return }

        let registered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: identifier,
            using: nil
        ) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refresh)
        }
        if registered {
            log.info("Registered BGAppRefresh \(identifier, privacy: .public)")
        } else {
            log.error("BGAppRefresh registration failed for \(identifier, privacy: .public)")
        }
    }

    static func scheduleNext() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: earliestInterval)
        do {
            try BGTaskScheduler.shared.submit(request)
            log.info("Scheduled BGAppRefresh earliest=\(Int(earliestInterval), privacy: .public)s")
        } catch {
            log.error("BGAppRefresh submit failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private static func handle(_ task: BGAppRefreshTask) {
        let gate = BackgroundSyncGate()
        // BGAppRefreshTask is not Sendable. The box keeps the completion on this wake.
        let box = RefreshTaskBox(task)
        task.expirationHandler = {
            gate.expire()
        }
        Task { @MainActor in
            await HealthBackgroundDelivery.shared.performBudgetedSync(trigger: .appRefresh, gate: gate)
            box.task.setTaskCompleted(success: !gate.isExpired)
            scheduleNext()
        }
    }
}

private final class RefreshTaskBox: @unchecked Sendable {
    let task: BGAppRefreshTask
    init(_ task: BGAppRefreshTask) { self.task = task }
}
