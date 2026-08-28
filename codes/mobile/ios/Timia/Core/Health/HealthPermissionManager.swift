import Foundation
import HealthKit
import UIKit

/// One-shot HealthKit read authorization for the types Timia syncs.
@MainActor
final class HealthPermissionManager: ObservableObject {
    static let shared = HealthPermissionManager()

    @Published private(set) var didRequest = false
    @Published private(set) var lastError: String?

    private let store = HKHealthStore()
    private let requestedKey = "timia.health.didRequestAuthorization"

    private init() {
        didRequest = UserDefaults.standard.bool(forKey: requestedKey)
    }

    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    static var readTypes: Set<HKObjectType> {
        [
            HKObjectType.workoutType(),
            HKSeriesType.workoutRoute(),
            HKSeriesType.heartbeat(),
            HKQuantityType(.heartRate),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.basalEnergyBurned),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.stepCount),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.distanceCycling),
            HKQuantityType(.flightsClimbed),
            HKQuantityType(.appleExerciseTime),
            HKQuantityType(.appleStandTime),
            HKQuantityType(.bodyMass),
            HKQuantityType(.oxygenSaturation),
            HKQuantityType(.vo2Max),
            HKQuantityType(.heartRateRecoveryOneMinute),
            HKQuantityType(.runningSpeed),
            HKQuantityType(.walkingSpeed),
            HKQuantityType(.cyclingSpeed),
            HKQuantityType(.cyclingCadence),
            HKCategoryType(.sleepAnalysis),
            HKCategoryType(.appleStandHour),
        ]
    }

    @discardableResult
    func requestIfNeeded() async -> Bool {
        guard isHealthDataAvailable else {
            lastError = "此设备不支持健康数据"
            return false
        }
        do {
            try await store.requestAuthorization(toShare: [], read: Self.readTypes)
            UserDefaults.standard.set(true, forKey: requestedKey)
            didRequest = true
            lastError = nil
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
