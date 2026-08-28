import Foundation
import HealthKit

/// Registers HealthKit observer queries so iOS can wake Timia for near-real-time sync.
@MainActor
final class HealthBackgroundDelivery {
    static let shared = HealthBackgroundDelivery()

    private let store = HKHealthStore()
    private let lastSyncKey = "timia.health.observerAnchorDate"
    private var started = false
    private var inFlight = false
    private var api: APIClient?

    private init() {}

    func start(api: APIClient) async {
        self.api = api
        guard HKHealthStore.isHealthDataAvailable() else { return }
        guard HealthPermissionManager.shared.didRequest else { return }
        guard !started else { return }
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

    private func handleUpdate() async {
        guard let api, !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        let start = UserDefaults.standard.object(forKey: lastSyncKey) as? Date
            ?? Calendar.current.date(byAdding: .hour, value: -6, to: Date())
            ?? Date()
        do {
            let export = try await HealthKitStore().exportSamples(from: start)
            try await HealthSyncService(api: HealthSyncAPI(client: api)).upload(export) { _, _ in }
            UserDefaults.standard.set(Date(), forKey: lastSyncKey)
        } catch {
            // Keep the observer alive; the next wake or manual sync retries.
        }
    }

    private var observerTypes: [HKSampleType] {
        [
            HKQuantityType(.heartRate),
            HKQuantityType(.stepCount),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.basalEnergyBurned),
            HKObjectType.workoutType(),
            HKCategoryType(.sleepAnalysis),
            HKCategoryType(.appleStandHour),
            HKQuantityType(.oxygenSaturation),
            HKQuantityType(.bodyMass),
            HKSeriesType.heartbeat(),
        ]
    }
}
