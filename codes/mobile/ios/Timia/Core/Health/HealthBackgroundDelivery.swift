import Foundation
import HealthKit
import os
import UIKit

enum HealthBackgroundTrigger: String, Sendable {
    case healthKit
    case foreground
    case appRefresh
    case coalesced
}

/// Registers HealthKit observer queries so iOS can wake Timia for a budgeted sync.
@MainActor
final class HealthBackgroundDelivery {
    static let shared = HealthBackgroundDelivery()

    private static let log = Logger(subsystem: "online.timia.ios", category: "HealthBackground")
    /// Cold background launch waits this long for session restore to attach an API client.
    private static let apiWaitSeconds: TimeInterval = 8

    private let store = HKHealthStore()
    private var observersStarted = false
    private var inFlight = false
    private var pendingRerun = false
    private var pendingForeground = false
    private var api: APIClient?
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    private var backgroundGeneration = 0
    private var endedBackgroundTaskIDs: Set<UIBackgroundTaskIdentifier> = []

    private init() {}

    func start(api: APIClient) async {
        self.api = api
        guard HKHealthStore.isHealthDataAvailable() else {
            Self.log.info("Health data is not available; background delivery not registered")
            return
        }
        guard HealthPermissionManager.shared.didRequest else {
            Self.log.info("Health authorization has not been requested; background delivery deferred")
            return
        }
        if !observersStarted {
            observersStarted = true
            registerObservers()
        }
        await enableBackgroundDelivery()
        scheduleAppRefresh()
    }

    func scheduleAppRefresh() {
        guard observersStarted else { return }
        HealthBackgroundRefresh.scheduleNext()
    }

    /// Budgeted catch-up when the scene becomes active again. Not a 90-day manual sync.
    func catchUp() async {
        if inFlight {
            pendingForeground = true
            while inFlight {
                try? await Task.sleep(for: .milliseconds(200))
            }
            // The in-flight wake already started a fresh foreground pass.
            if !pendingForeground { return }
            pendingForeground = false
        }
        await performBudgetedSync(trigger: .foreground, gate: nil)
    }

    func performBudgetedSync(trigger: HealthBackgroundTrigger, gate externalGate: BackgroundSyncGate?) async {
        if inFlight {
            if trigger == .foreground {
                pendingForeground = true
            } else {
                pendingRerun = true
            }
            Self.log.info("Coalesced overlapping \(trigger.rawValue, privacy: .public) wake")
            return
        }

        inFlight = true
        let ownsGate = externalGate == nil
        var gate = externalGate ?? BackgroundSyncGate()
        var current = trigger
        beginBackgroundTask(gate: gate)
        defer {
            inFlight = false
            endBackgroundTask()
        }

        var passes = 0
        while passes < 2 {
            passes += 1
            pendingRerun = false
            await runBudgetedSync(trigger: current, gate: gate)
            if pendingForeground && ownsGate {
                pendingForeground = false
                pendingRerun = false
                endBackgroundTask()
                gate = BackgroundSyncGate()
                beginBackgroundTask(gate: gate)
                current = .foreground
                continue
            }
            if pendingRerun && !gate.isExpired {
                current = .coalesced
                continue
            }
            break
        }
    }

    private func runBudgetedSync(trigger: HealthBackgroundTrigger, gate: BackgroundSyncGate) async {
        Self.log.info("Budgeted health sync start trigger=\(trigger.rawValue, privacy: .public)")
        guard let api = await resolveAPI(gate: gate) else {
            Self.log.error("Budgeted sync skipped (\(trigger.rawValue, privacy: .public)): no API client")
            return
        }
        guard HealthPermissionManager.shared.didRequest else {
            Self.log.info("Budgeted sync skipped (\(trigger.rawValue, privacy: .public)): health authorization not requested")
            return
        }
        guard HKHealthStore.isHealthDataAvailable() else { return }

        do {
            let syncAPI = HealthSyncAPI(client: api)
            let remaining = gate.wakeDeadline.timeIntervalSinceNow
            guard remaining >= BackgroundWakeBudget.minimumSlice, !gate.isExpired else {
                Self.log.error("Budgeted sync expired before status (\(trigger.rawValue, privacy: .public))")
                return
            }
            let status = try await syncAPI.syncStatus(
                timezone: TimeZone.current.identifier,
                timeoutInterval: min(10, remaining)
            )
            let healthWatermark = await HealthSyncService.applyServerWatermark(
                status.lastHealthSyncedAt.flatMap(HealthSyncService.parseISO)
            )
            let workoutWatermark = await WorkoutSyncService.applyServerWatermark(
                status.lastWorkoutSyncedAt.flatMap(HealthSyncService.parseISO)
            )
            // First 90-day sync stays on the manual foreground path.
            guard healthWatermark != nil || workoutWatermark != nil else {
                Self.log.info("Skipping budgeted sync until the first foreground sync sets a watermark")
                return
            }
            guard !gate.isExpired else {
                Self.log.error("Budgeted sync expired after status (\(trigger.rawValue, privacy: .public))")
                return
            }

            let workoutAlsoPending = workoutWatermark != nil
            if healthWatermark != nil {
                let healthDeadline = BackgroundWakeBudget.healthDeadline(
                    wakeDeadline: gate.wakeDeadline,
                    workoutAlsoPending: workoutAlsoPending
                )
                if BackgroundWakeBudget.shouldStartSlice(deadline: healthDeadline), !gate.isExpired {
                    let service = HealthSyncService(api: syncAPI)
                    _ = try await service.syncBackgroundBudgeted(
                        budget: BackgroundWakeBudget.drainBudget(until: healthDeadline),
                        shouldStop: {
                            gate.isExpired || !BackgroundWakeBudget.shouldStartSlice(deadline: healthDeadline)
                        }
                    )
                } else {
                    Self.log.info("Health slice skipped; shared wake budget is exhausted")
                }
            }
            if workoutWatermark != nil {
                if BackgroundWakeBudget.shouldStartSlice(deadline: gate.wakeDeadline), !gate.isExpired {
                    try await WorkoutSyncService(api: syncAPI).syncBackgroundBudgeted(
                        deadline: gate.wakeDeadline,
                        shouldStop: { gate.isExpired }
                    )
                } else {
                    Self.log.info("Workout slice skipped; shared wake budget is exhausted")
                }
            }
            if !gate.isExpired {
                await ScreenNotificationManager.shared.refresh(api: api)
            }
        } catch {
            Self.log.error(
                "Budgeted sync failed (\(trigger.rawValue, privacy: .public)): \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    private func resolveAPI(gate: BackgroundSyncGate) async -> APIClient? {
        if let api { return api }
        guard Self.hasStoredSession() else { return nil }
        let waitUntil = Date().addingTimeInterval(Self.apiWaitSeconds)
        while api == nil && !gate.isExpired && Date() < waitUntil {
            try? await Task.sleep(for: .milliseconds(200))
        }
        return api
    }

    private static func hasStoredSession() -> Bool {
        let keychain = KeychainStore()
        let refresh = keychain.readString(KeychainStore.Account.refreshToken) != nil
        let session = keychain.readString(KeychainStore.Account.sessionID) != nil
        let legacy = keychain.readString(KeychainStore.Account.legacyAccessToken) != nil
        return (refresh && session) || legacy
    }

    private func registerObservers() {
        for type in observerTypes {
            let identifier = type.identifier
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
                if let error {
                    Self.log.error(
                        "HealthKit observer failed \(identifier, privacy: .public): \(error.localizedDescription, privacy: .public)"
                    )
                    completion()
                    return
                }
                // Complete only after the budgeted attempt. Completing in the callback
                // lets iOS suspend the process before the upload starts.
                Task { @MainActor in
                    if let self {
                        await self.performBudgetedSync(trigger: .healthKit, gate: nil)
                    }
                    completion()
                }
            }
            store.execute(query)
        }
    }

    private func enableBackgroundDelivery() async {
        let types = observerTypes
        var failures: [String] = []
        for type in types {
            let identifier = type.identifier
            if let failure = await enableDelivery(for: type) {
                failures.append("\(identifier): \(failure)")
            }
        }
        if failures.isEmpty {
            Self.log.info("HealthKit background delivery enabled for \(types.count, privacy: .public) types")
        } else {
            Self.log.error(
                "HealthKit background delivery failed (\(failures.count, privacy: .public)/\(types.count, privacy: .public)): \(failures.joined(separator: "; "), privacy: .public)"
            )
        }
    }

    /// Retried from `start` on each signed-in launch and when returning from background.
    private func enableDelivery(for type: HKSampleType) async -> String? {
        await withCheckedContinuation { continuation in
            let box = OnceResume(continuation)
            store.enableBackgroundDelivery(for: type, frequency: .immediate) { success, error in
                let message = success ? nil : (error?.localizedDescription ?? "unknown")
                box.resume(message)
            }
            // Don't let a missing callback block launch catch-up. The next `start` retries.
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(800))
                box.resume("timed out")
            }
        }
    }

    private func beginBackgroundTask(gate: BackgroundSyncGate) {
        endBackgroundTask()
        backgroundGeneration += 1
        let generation = backgroundGeneration
        let taskID = UIApplication.shared.beginBackgroundTask(withName: "health-sync-bg") { [weak self, gate] in
            gate.expire()
            Task { @MainActor in
                // A replaced wake has a newer generation. Do not end that newer task.
                guard let self, self.backgroundGeneration == generation else { return }
                self.endBackgroundTask()
            }
        }
        backgroundTaskID = taskID
        if taskID == .invalid {
            Self.log.error("beginBackgroundTask returned invalid; sync will rely on the system wake")
        }
    }

    private func endBackgroundTask() {
        endBackgroundTask(backgroundTaskID)
    }

    /// Ends only `taskID`. A previous wake's expiration handler must not end the replacement task.
    private func endBackgroundTask(_ taskID: UIBackgroundTaskIdentifier) {
        guard taskID != .invalid else { return }
        guard endedBackgroundTaskIDs.insert(taskID).inserted else { return }
        if backgroundTaskID == taskID {
            backgroundTaskID = .invalid
        }
        UIApplication.shared.endBackgroundTask(taskID)
    }

    private var observerTypes: [HKSampleType] {
        [
            HKQuantityType(.heartRate),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.stepCount),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.basalEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.appleExerciseTime),
            HKQuantityType(.appleStandTime),
            HKQuantityType(.oxygenSaturation),
            HKQuantityType(.bodyMass),
            HKQuantityType(.vo2Max),
            HKQuantityType(.heartRateRecoveryOneMinute),
            HKObjectType.workoutType(),
            HKCategoryType(.sleepAnalysis),
            HKCategoryType(.appleStandHour),
            HKSeriesType.heartbeat(),
        ]
    }
}

/// Resumes a continuation once from either the HealthKit callback or the timeout.
private final class OnceResume<T>: @unchecked Sendable {
    private var continuation: CheckedContinuation<T, Never>?
    private let lock = NSLock()

    init(_ continuation: CheckedContinuation<T, Never>) {
        self.continuation = continuation
    }

    func resume(_ value: T) {
        lock.lock()
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume(returning: value)
    }
}
