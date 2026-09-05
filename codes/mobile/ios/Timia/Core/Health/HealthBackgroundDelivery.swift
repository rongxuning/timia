import Foundation
import HealthKit
import UIKit

/// Registers HealthKit observer queries so iOS can wake Timia for near-real-time sync.
@MainActor
final class HealthBackgroundDelivery {
    static let shared = HealthBackgroundDelivery()

    private let store = HKHealthStore()
    private var started = false
    private var inFlight = false
    private var api: APIClient?
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

    private init() {}

    func start(api: APIClient) async {
        self.api = api
        guard HKHealthStore.isHealthDataAvailable() else { return }
        guard HealthPermissionManager.shared.didRequest else { return }
        if !started {
            started = true
            for type in observerTypes {
                let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
                    defer { completion() }
                    guard error == nil else { return }
                    Task { @MainActor in
                        await self?.handleUpdate()
                    }
                }
                store.execute(query)
                store.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
            }
        }
    }

    private func handleUpdate() async {
        guard let api, !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        do {
            let syncAPI = HealthSyncAPI(client: api)
            let status = try await syncAPI.syncStatus(timezone: TimeZone.current.identifier)
            let server = status.lastSyncedAt.flatMap(HealthSyncService.parseISO)
            let watermark = await HealthSyncService.applyServerWatermark(server)
            // First sync (nil watermark) remains foreground-only.
            guard watermark != nil else { return }

            beginBackgroundTask()
            defer { endBackgroundTask() }

            let service = HealthSyncService(api: syncAPI)
            // Anchored delta → enqueue → budgeted drain (heals with short window if anchors unhealthy).
            _ = try await service.syncBackgroundBudgeted(budget: .background)
        } catch {
            // Keep the observer alive; day checkpoints + next wake or manual sync retry.
        }
    }

    private func beginBackgroundTask() {
        endBackgroundTask()
        var taskID = UIBackgroundTaskIdentifier.invalid
        taskID = UIApplication.shared.beginBackgroundTask(withName: "health-sync-bg") { [weak self] in
            Task { @MainActor in
                self?.endBackgroundTask()
            }
        }
        backgroundTaskID = taskID
    }

    private func endBackgroundTask() {
        let taskID = backgroundTaskID
        guard taskID != .invalid else { return }
        backgroundTaskID = .invalid
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
