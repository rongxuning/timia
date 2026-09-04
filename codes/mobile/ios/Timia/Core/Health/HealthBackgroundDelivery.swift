import Foundation
import HealthKit

/// Registers HealthKit observer queries so iOS can wake Timia for near-real-time sync.
@MainActor
final class HealthBackgroundDelivery {
    static let shared = HealthBackgroundDelivery()

    private let store = HKHealthStore()
    private var started = false
    private var inFlight = false
    private var api: APIClient?

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
            let watermark = HealthSyncService.applyServerWatermark(server)
            guard watermark != nil else { return }
            let start = HealthSyncService.startDate(lastSyncedAt: watermark)
            let end = Date()
            let service = HealthSyncService(api: syncAPI)
            try await service.syncWindow(from: start, to: end, source: .background) { _, _ in }
        } catch {
            // Keep the observer alive; day checkpoints + next wake or manual sync retry.
        }
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
