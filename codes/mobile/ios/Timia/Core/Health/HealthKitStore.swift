import CryptoKit
import CoreLocation
import Foundation
import HealthKit

struct HealthKitExport: Sendable {
    var samples: [HealthQuantitySamplePayload]
    var sleep: [HealthSleepSamplePayload]
    var standHours: [HealthStandHourPayload]
    var workouts: [HealthWorkoutPayload]
    var routes: [HealthWorkoutRoutePayload]
    var heartbeats: [HealthHeartbeatSeriesPayload]
}

enum HealthKitStoreError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable: "此设备不支持健康数据"
        }
    }
}

struct HealthKitStore {
    private let store = HKHealthStore()
    private let timezone = TimeZone.current.identifier

    func exportSamples(from start: Date, to end: Date = Date()) async throws -> HealthKitExport {
        guard HKHealthStore.isHealthDataAvailable() else { throw HealthKitStoreError.unavailable }
        async let samplesTask: [HealthQuantitySamplePayload] = fetchQuantities(from: start, to: end)
        async let sleepTask: [HealthSleepSamplePayload] = fetchSleep(from: start, to: end)
        async let standTask: [HealthStandHourPayload] = fetchStandHours(from: start, to: end)
        async let workoutsTask: ([HealthWorkoutPayload], [HealthWorkoutRoutePayload]) = fetchWorkouts(from: start, to: end)
        async let heartbeatsTask: [HealthHeartbeatSeriesPayload] = fetchHeartbeats(from: start, to: end)
        let (workouts, routes) = await workoutsTask
        return HealthKitExport(
            samples: await samplesTask,
            sleep: await sleepTask,
            standHours: await standTask,
            workouts: workouts,
            routes: routes,
            heartbeats: await heartbeatsTask
        )
    }

    private func fetchQuantities(from start: Date, to end: Date) async -> [HealthQuantitySamplePayload] {
        let perSpec: [[HealthQuantitySamplePayload]] = await withTaskGroup(of: [HealthQuantitySamplePayload].self) { group in
            for spec in Self.quantitySpecs {
                group.addTask { [self] in
                    // Series query completes with 0 rows (not an error) for discrete types
                    // like steps and energy. Only falling back on throw would skip them.
                    let series = (try? await self.queryQuantitySeries(spec, from: start, to: end)) ?? []
                    if !series.isEmpty { return series }
                    return (try? await self.queryQuantitySamples(spec, from: start, to: end)) ?? []
                }
            }
            var results: [[HealthQuantitySamplePayload]] = []
            for await rows in group { results.append(rows) }
            return results
        }
        var collected: [HealthQuantitySamplePayload] = []
        var seen = Set<String>()
        for rows in perSpec {
            for row in rows where seen.insert(row.hkUuid).inserted {
                collected.append(row)
            }
        }
        return collected
    }

    private func queryQuantitySeries(
        _ spec: QuantitySpec,
        from start: Date,
        to end: Date
    ) async throws -> [HealthQuantitySamplePayload] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return try await withCheckedThrowingContinuation { continuation in
            let once = ResumeOnce()
            let rows = RowBox<HealthQuantitySamplePayload>()
            let query = HKQuantitySeriesSampleQuery(quantityType: spec.type, predicate: predicate) {
                _, quantity, interval, sample, done, error in
                if let error {
                    once.resume { continuation.resume(throwing: error) }
                    return
                }
                if let quantity, let interval, let sample {
                    rows.items.append(
                        HealthQuantitySamplePayload(
                            hkUuid: Self.derivedUUID(parent: sample.uuid, at: interval.start),
                            metricType: spec.metric,
                            startAt: Self.isoString(interval.start),
                            endAt: Self.isoString(interval.end),
                            value: spec.normalized(quantity.doubleValue(for: spec.unit)),
                            unit: spec.unitName,
                            sourceBundleId: sample.sourceRevision.source.bundleIdentifier,
                            sourceName: sample.sourceRevision.source.name
                        )
                    )
                }
                if done {
                    once.resume { continuation.resume(returning: rows.items) }
                }
            }
            store.execute(query)
        }
    }

    private func queryQuantitySamples(
        _ spec: QuantitySpec,
        from start: Date,
        to end: Date
    ) async throws -> [HealthQuantitySamplePayload] {
        let samples = try await sampleQuery(spec.type, from: start, to: end)
        return samples.compactMap { sample in
            guard let quantitySample = sample as? HKQuantitySample else { return nil }
            return HealthQuantitySamplePayload(
                hkUuid: quantitySample.uuid.uuidString.lowercased(),
                metricType: spec.metric,
                startAt: Self.isoString(quantitySample.startDate),
                endAt: Self.isoString(quantitySample.endDate),
                value: spec.normalized(quantitySample.quantity.doubleValue(for: spec.unit)),
                unit: spec.unitName,
                sourceBundleId: quantitySample.sourceRevision.source.bundleIdentifier,
                sourceName: quantitySample.sourceRevision.source.name
            )
        }
    }

    private func fetchSleep(from start: Date, to end: Date) async -> [HealthSleepSamplePayload] {
        let samples = (try? await sampleQuery(HKCategoryType(.sleepAnalysis), from: start, to: end)) ?? []
        return samples.compactMap { sample in
            guard let category = sample as? HKCategorySample else { return nil }
            return HealthSleepSamplePayload(
                hkUuid: category.uuid.uuidString.lowercased(),
                startAt: Self.isoString(category.startDate),
                endAt: Self.isoString(category.endDate),
                stage: Self.sleepStage(category.value),
                timezone: timezone,
                sourceBundleId: category.sourceRevision.source.bundleIdentifier,
                sourceName: category.sourceRevision.source.name
            )
        }
    }

    private func fetchStandHours(from start: Date, to end: Date) async -> [HealthStandHourPayload] {
        let samples = (try? await sampleQuery(HKCategoryType(.appleStandHour), from: start, to: end)) ?? []
        return samples.compactMap { sample in
            guard let category = sample as? HKCategorySample else { return nil }
            return HealthStandHourPayload(
                hkUuid: category.uuid.uuidString.lowercased(),
                startAt: Self.isoString(category.startDate),
                endAt: Self.isoString(category.endDate),
                stood: category.value == HKCategoryValueAppleStandHour.stood.rawValue,
                sourceBundleId: category.sourceRevision.source.bundleIdentifier,
                sourceName: category.sourceRevision.source.name
            )
        }
    }

    private func fetchWorkouts(
        from start: Date,
        to end: Date
    ) async -> ([HealthWorkoutPayload], [HealthWorkoutRoutePayload]) {
        let samples = (try? await sampleQuery(HKObjectType.workoutType(), from: start, to: end)) ?? []
        let workoutList = samples.compactMap { $0 as? HKWorkout }
        async let payloads: [HealthWorkoutPayload] = withTaskGroup(of: (Int, HealthWorkoutPayload).self) { group in
            for (index, workout) in workoutList.enumerated() {
                group.addTask { [self] in
                    return (index, await self.workoutPayload(workout))
                }
            }
            var collected: [(Int, HealthWorkoutPayload)] = []
            for await item in group { collected.append(item) }
            return collected.sorted { $0.0 < $1.0 }.map { $0.1 }
        }
        async let routes: [HealthWorkoutRoutePayload] = withTaskGroup(of: HealthWorkoutRoutePayload?.self) { group in
            for workout in workoutList {
                group.addTask { [self] in
                    return await self.fetchRoute(for: workout)
                }
            }
            var collected: [HealthWorkoutRoutePayload] = []
            for await item in group {
                if let item { collected.append(item) }
            }
            return collected
        }
        return (await payloads, await routes)
    }

    private func workoutPayload(_ workout: HKWorkout) async -> HealthWorkoutPayload {
        let distanceM = workout.totalDistance?.doubleValue(for: .meter())
        let bpmUnit = HKUnit.count().unitDivided(by: .minute())
        return HealthWorkoutPayload(
            hkUuid: workout.uuid.uuidString.lowercased(),
            activityType: Self.activityType(workout.workoutActivityType),
            activityTypeRaw: Self.activityTypeRaw(workout.workoutActivityType),
            startAt: Self.isoString(workout.startDate),
            endAt: Self.isoString(workout.endDate),
            durationSeconds: Int(workout.duration),
            activeEnergyKcal: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
                ?? Self.average(workout, .activeEnergyBurned, unit: .kilocalorie()),
            distanceM: distanceM,
            avgHrBpm: await quantityAverage(workout, .heartRate, unit: bpmUnit),
            maxHrBpm: await quantityMaximum(workout, .heartRate, unit: bpmUnit),
            avgCadenceSpm: await cadence(workout),
            avgPaceSecPerKm: Self.paceSecPerKm(workout, distanceM: distanceM),
            elevationAscendedM: Self.elevationM(workout, key: HKMetadataKeyElevationAscended),
            elevationDescendedM: Self.elevationM(workout, key: HKMetadataKeyElevationDescended),
            weatherTempC: Self.weatherTempC(workout),
            weatherHumidity: Self.weatherHumidity(workout),
            locationCountry: nil,
            locationAdmin: nil,
            locationCity: nil,
            sourceBundleId: workout.sourceRevision.source.bundleIdentifier,
            sourceName: workout.sourceRevision.source.name
        )
    }

    private func quantityAverage(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async -> Double? {
        if let value = Self.average(workout, identifier, unit: unit) {
            return value
        }
        return await statisticsQuantity(workout, identifier, unit: unit, pick: { $0.averageQuantity() })
    }

    private func quantityMaximum(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async -> Double? {
        if let value = Self.maximum(workout, identifier, unit: unit) {
            return value
        }
        return await statisticsQuantity(workout, identifier, unit: unit, pick: { $0.maximumQuantity() })
    }

    private func quantitySum(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async -> Double? {
        if let value = Self.sum(workout, identifier, unit: unit) {
            return value
        }
        return await statisticsQuantity(workout, identifier, unit: unit, pick: { $0.sumQuantity() })
    }

    private func statisticsQuantity(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        pick: @escaping (HKStatistics) -> HKQuantity?
    ) async -> Double? {
        let type = HKQuantityType(identifier)
        let predicate = HKQuery.predicateForSamples(
            withStart: workout.startDate,
            end: workout.endDate,
            options: [.strictStartDate, .strictEndDate]
        )
        let options: HKStatisticsOptions = type.aggregationStyle == .cumulative ? .cumulativeSum : [.discreteAverage, .discreteMin, .discreteMax]
        return await withCheckedContinuation { continuation in
            let once = ResumeOnce()
            let query = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: options
            ) { _, stats, _ in
                once.resume {
                    continuation.resume(returning: stats.flatMap(pick)?.doubleValue(for: unit))
                }
            }
            store.execute(query)
        }
    }

    private static func average(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) -> Double? {
        workout.statistics(for: HKQuantityType(identifier))?.averageQuantity()?.doubleValue(for: unit)
    }

    private static func maximum(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) -> Double? {
        workout.statistics(for: HKQuantityType(identifier))?.maximumQuantity()?.doubleValue(for: unit)
    }

    private static func sum(
        _ workout: HKWorkout,
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) -> Double? {
        workout.statistics(for: HKQuantityType(identifier))?.sumQuantity()?.doubleValue(for: unit)
    }

    private func cadence(_ workout: HKWorkout) async -> Double? {
        let token = Self.activityType(workout.workoutActivityType)
        let spmUnit = HKUnit.count().unitDivided(by: .minute())
        if token == "cycling" || token == "hand_cycling" {
            if let cycling = await quantityAverage(workout, .cyclingCadence, unit: spmUnit), cycling > 0 {
                return cycling
            }
            return nil
        }
        guard ["running", "walking", "hiking", "wheelchair_walk", "wheelchair_run"].contains(token) else {
            return nil
        }
        guard workout.duration > 30, let steps = await quantitySum(workout, .stepCount, unit: .count()), steps > 0 else {
            return nil
        }
        let spm = steps / (workout.duration / 60)
        return spm >= 20 ? spm : nil
    }

    private static func paceSecPerKm(_ workout: HKWorkout, distanceM: Double?) -> Double? {
        let token = activityType(workout.workoutActivityType)
        guard ["running", "walking", "cycling", "hiking", "hand_cycling", "wheelchair_walk", "wheelchair_run"]
            .contains(token)
        else {
            return nil
        }
        let mpsUnit = HKUnit.meter().unitDivided(by: .second())
        let speed = average(workout, .runningSpeed, unit: mpsUnit)
            ?? average(workout, .walkingSpeed, unit: mpsUnit)
            ?? average(workout, .cyclingSpeed, unit: mpsUnit)
        if let speed, speed > 0.3 {
            return 1000 / speed
        }
        guard let distanceM, distanceM > 50, workout.duration > 0 else { return nil }
        return workout.duration / (distanceM / 1000)
    }

    private static func elevationM(_ workout: HKWorkout, key: String) -> Double? {
        (workout.metadata?[key] as? HKQuantity)?.doubleValue(for: .meter())
    }

    private static func weatherTempC(_ workout: HKWorkout) -> Double? {
        (workout.metadata?[HKMetadataKeyWeatherTemperature] as? HKQuantity)?
            .doubleValue(for: .degreeCelsius())
    }

    private static func weatherHumidity(_ workout: HKWorkout) -> Double? {
        guard let quantity = workout.metadata?[HKMetadataKeyWeatherHumidity] as? HKQuantity else { return nil }
        let value = quantity.doubleValue(for: .percent())
        return value > 1 ? value / 100 : value
    }

    private func fetchRoute(for workout: HKWorkout) async -> HealthWorkoutRoutePayload? {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let samples: [HKSample] = await withCheckedContinuation { continuation in
            let once = ResumeOnce()
            let query = HKSampleQuery(
                sampleType: HKSeriesType.workoutRoute(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, _ in
                once.resume { continuation.resume(returning: samples ?? []) }
            }
            store.execute(query)
        }
        var locations: [CLLocation] = []
        for sample in samples {
            guard let route = sample as? HKWorkoutRoute else { continue }
            locations.append(contentsOf: await collectRouteLocations(route))
        }
        locations.sort { $0.timestamp < $1.timestamp }
        let points = Self.downsample(locations, maxCount: 1800).map { location in
            HealthWorkoutRoutePoint(
                t: max(0, location.timestamp.timeIntervalSince(workout.startDate)),
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                alt: location.verticalAccuracy >= 0 ? location.altitude : nil
            )
        }
        guard points.count >= 2 else { return nil }
        return HealthWorkoutRoutePayload(
            hkUuid: workout.uuid.uuidString.lowercased(),
            points: points
        )
    }

    private func collectRouteLocations(_ route: HKWorkoutRoute) async -> [CLLocation] {
        await withCheckedContinuation { continuation in
            let once = ResumeOnce()
            let rows = RowBox<CLLocation>()
            let query = HKWorkoutRouteQuery(route: route) { _, locations, done, error in
                if let locations {
                    rows.items.append(contentsOf: locations)
                }
                if done || error != nil {
                    once.resume { continuation.resume(returning: rows.items) }
                }
            }
            store.execute(query)
        }
    }

    private static func downsample<T>(_ items: [T], maxCount: Int) -> [T] {
        let count = items.count
        guard count > maxCount, maxCount >= 2 else { return items }
        return (0..<maxCount).map { i in
            items[i * (count - 1) / (maxCount - 1)]
        }
    }

    private func fetchHeartbeats(from start: Date, to end: Date) async -> [HealthHeartbeatSeriesPayload] {
        let samples = (try? await sampleQuery(HKSeriesType.heartbeat(), from: start, to: end)) ?? []
        var result: [HealthHeartbeatSeriesPayload] = []
        for sample in samples {
            guard let series = sample as? HKHeartbeatSeriesSample else { continue }
            let intervals = (try? await heartbeatIntervals(series)) ?? []
            result.append(
                HealthHeartbeatSeriesPayload(
                    hkUuid: series.uuid.uuidString.lowercased(),
                    startAt: Self.isoString(series.startDate),
                    endAt: Self.isoString(series.endDate),
                    intervals: intervals,
                    sourceBundleId: series.sourceRevision.source.bundleIdentifier,
                    sourceName: series.sourceRevision.source.name
                )
            )
        }
        return result
    }

    private func heartbeatIntervals(_ series: HKHeartbeatSeriesSample) async throws -> [HealthHeartbeatIntervalPayload] {
        try await withCheckedThrowingContinuation { continuation in
            let once = ResumeOnce()
            let rows = RowBox<HealthHeartbeatIntervalPayload>()
            let query = HKHeartbeatSeriesQuery(heartbeatSeries: series) { _, timeSinceStart, precededByGap, done, error in
                if let error {
                    once.resume { continuation.resume(throwing: error) }
                    return
                }
                rows.items.append(HealthHeartbeatIntervalPayload(t: timeSinceStart, gap: precededByGap))
                if done {
                    once.resume { continuation.resume(returning: rows.items) }
                }
            }
            store.execute(query)
        }
    }

    private func sampleQuery(_ type: HKSampleType, from start: Date, to end: Date) async throws -> [HKSample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return try await withCheckedThrowingContinuation { continuation in
            let once = ResumeOnce()
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error {
                    once.resume { continuation.resume(throwing: error) }
                } else {
                    once.resume { continuation.resume(returning: samples ?? []) }
                }
            }
            store.execute(query)
        }
    }

    private static func isoString(_ date: Date) -> String {
        date.ISO8601Format(.init(includingFractionalSeconds: true))
    }

    /// Stable UUID per expanded series point so unique (owner, hk_uuid) is not overwritten.
    private static func derivedUUID(parent: UUID, at date: Date) -> String {
        let seed = "\(parent.uuidString.lowercased())|\(date.timeIntervalSince1970)"
        let digest = SHA256.hash(data: Data(seed.utf8))
        var bytes = Array(digest.prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let uuid = UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
        return uuid.uuidString.lowercased()
    }

    private static func sleepStage(_ value: Int) -> String {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: "in_bed"
        case .awake: "awake"
        case .asleepCore: "core"
        case .asleepDeep: "deep"
        case .asleepREM: "rem"
        default: "unspecified"
        }
    }

    static func activityType(_ value: HKWorkoutActivityType) -> String {
        activityMapping(value).token
    }

    static func activityTypeRaw(_ value: HKWorkoutActivityType) -> String {
        activityMapping(value).raw
    }

    static func activityTitle(_ token: String) -> String {
        switch token {
        case "running": "跑步"
        case "walking": "步行"
        case "cycling": "骑行"
        case "hiking": "徒步"
        case "swimming": "游泳"
        case "strength": "力量训练"
        case "functional_strength": "功能性力量"
        case "yoga": "瑜伽"
        case "hiit": "高强度间歇"
        case "elliptical": "椭圆机"
        case "rowing": "划船"
        case "core_training": "核心训练"
        case "pilates": "普拉提"
        case "dance", "cardio_dance", "social_dance", "dance_inspired": "舞蹈"
        case "martial_arts": "武术"
        case "boxing": "拳击"
        case "kickboxing": "踢拳"
        case "jump_rope": "跳绳"
        case "stairs", "stair_climbing": "爬楼"
        case "flexibility": "柔韧"
        case "cooldown": "放松恢复"
        case "mixed_cardio", "mixed_cardio_old", "cross_training": "混合有氧"
        case "tennis": "网球"
        case "table_tennis": "乒乓球"
        case "badminton": "羽毛球"
        case "basketball": "篮球"
        case "soccer": "足球"
        case "golf": "高尔夫"
        case "tai_chi": "太极"
        case "barre": "芭杆"
        case "mind_and_body": "身心"
        case "prep_recovery": "热身恢复"
        case "wheelchair_walk": "轮椅步行"
        case "wheelchair_run": "轮椅跑步"
        case "hand_cycling": "手摇骑行"
        case "pickleball": "匹克球"
        case "triathlon": "铁人三项"
        case "underwater_diving": "潜水"
        case "fitness_gaming": "健身游戏"
        default: "其他训练"
        }
    }

    /// Compact token plus HealthKit camelCase so the server can remap older `other` rows.
    private static func activityMapping(_ value: HKWorkoutActivityType) -> (token: String, raw: String) {
        switch value {
        case .americanFootball: ("american_football", "americanFootball")
        case .archery: ("archery", "archery")
        case .australianFootball: ("australian_football", "australianFootball")
        case .badminton: ("badminton", "badminton")
        case .baseball: ("baseball", "baseball")
        case .basketball: ("basketball", "basketball")
        case .bowling: ("bowling", "bowling")
        case .boxing: ("boxing", "boxing")
        case .climbing: ("climbing", "climbing")
        case .cricket: ("cricket", "cricket")
        case .crossTraining: ("cross_training", "crossTraining")
        case .curling: ("curling", "curling")
        case .cycling: ("cycling", "cycling")
        case .dance: ("dance", "dance")
        case .danceInspiredTraining: ("dance_inspired", "danceInspiredTraining")
        case .elliptical: ("elliptical", "elliptical")
        case .equestrianSports: ("equestrian", "equestrianSports")
        case .fencing: ("fencing", "fencing")
        case .fishing: ("fishing", "fishing")
        case .functionalStrengthTraining: ("functional_strength", "functionalStrengthTraining")
        case .golf: ("golf", "golf")
        case .gymnastics: ("gymnastics", "gymnastics")
        case .handball: ("handball", "handball")
        case .hiking: ("hiking", "hiking")
        case .hockey: ("hockey", "hockey")
        case .hunting: ("hunting", "hunting")
        case .lacrosse: ("lacrosse", "lacrosse")
        case .martialArts: ("martial_arts", "martialArts")
        case .mindAndBody: ("mind_and_body", "mindAndBody")
        case .mixedMetabolicCardioTraining: ("mixed_cardio_old", "mixedMetabolicCardioTraining")
        case .paddleSports: ("paddle", "paddleSports")
        case .play: ("play", "play")
        case .preparationAndRecovery: ("prep_recovery", "preparationAndRecovery")
        case .racquetball: ("racquetball", "racquetball")
        case .rowing: ("rowing", "rowing")
        case .rugby: ("rugby", "rugby")
        case .running: ("running", "running")
        case .sailing: ("sailing", "sailing")
        case .skatingSports: ("skating", "skatingSports")
        case .snowSports: ("snow", "snowSports")
        case .soccer: ("soccer", "soccer")
        case .softball: ("softball", "softball")
        case .squash: ("squash", "squash")
        case .stairClimbing: ("stair_climbing", "stairClimbing")
        case .surfingSports: ("surfing", "surfingSports")
        case .swimming: ("swimming", "swimming")
        case .tableTennis: ("table_tennis", "tableTennis")
        case .tennis: ("tennis", "tennis")
        case .trackAndField: ("track_field", "trackAndField")
        case .traditionalStrengthTraining: ("strength", "traditionalStrengthTraining")
        case .volleyball: ("volleyball", "volleyball")
        case .walking: ("walking", "walking")
        case .waterFitness: ("water_fitness", "waterFitness")
        case .waterPolo: ("water_polo", "waterPolo")
        case .waterSports: ("water_sports", "waterSports")
        case .wrestling: ("wrestling", "wrestling")
        case .yoga: ("yoga", "yoga")
        case .barre: ("barre", "barre")
        case .coreTraining: ("core_training", "coreTraining")
        case .crossCountrySkiing: ("xc_skiing", "crossCountrySkiing")
        case .downhillSkiing: ("downhill_skiing", "downhillSkiing")
        case .flexibility: ("flexibility", "flexibility")
        case .highIntensityIntervalTraining: ("hiit", "highIntensityIntervalTraining")
        case .jumpRope: ("jump_rope", "jumpRope")
        case .kickboxing: ("kickboxing", "kickboxing")
        case .pilates: ("pilates", "pilates")
        case .snowboarding: ("snowboarding", "snowboarding")
        case .stairs: ("stairs", "stairs")
        case .stepTraining: ("step_training", "stepTraining")
        case .wheelchairWalkPace: ("wheelchair_walk", "wheelchairWalkPace")
        case .wheelchairRunPace: ("wheelchair_run", "wheelchairRunPace")
        case .taiChi: ("tai_chi", "taiChi")
        case .mixedCardio: ("mixed_cardio", "mixedCardio")
        case .handCycling: ("hand_cycling", "handCycling")
        case .discSports: ("disc_sports", "discSports")
        case .fitnessGaming: ("fitness_gaming", "fitnessGaming")
        case .cardioDance: ("cardio_dance", "cardioDance")
        case .socialDance: ("social_dance", "socialDance")
        case .pickleball: ("pickleball", "pickleball")
        case .cooldown: ("cooldown", "cooldown")
        case .swimBikeRun: ("triathlon", "swimBikeRun")
        case .transition: ("transition", "transition")
        case .underwaterDiving: ("underwater_diving", "underwaterDiving")
        case .other: ("other", "other")
        @unknown default: ("other", String(describing: value))
        }
    }

    private struct QuantitySpec {
        var type: HKQuantityType
        var metric: String
        var unit: HKUnit
        var unitName: String

        func normalized(_ value: Double) -> Double {
            if metric == "oxygen_saturation", value > 1 { return value / 100 }
            if metric == "running_vertical_oscillation" { return value * 10 }
            if metric == "running_ground_contact" { return value * 1000 }
            return value
        }
    }

    private static let quantitySpecs: [QuantitySpec] = [
        .init(type: HKQuantityType(.heartRate), metric: "heart_rate", unit: HKUnit.count().unitDivided(by: .minute()), unitName: "bpm"),
        .init(type: HKQuantityType(.restingHeartRate), metric: "resting_heart_rate", unit: HKUnit.count().unitDivided(by: .minute()), unitName: "bpm"),
        .init(type: HKQuantityType(.heartRateVariabilitySDNN), metric: "hrv_sdnn", unit: .secondUnit(with: .milli), unitName: "ms"),
        .init(type: HKQuantityType(.basalEnergyBurned), metric: "basal_energy", unit: .kilocalorie(), unitName: "kcal"),
        .init(type: HKQuantityType(.activeEnergyBurned), metric: "active_energy", unit: .kilocalorie(), unitName: "kcal"),
        .init(type: HKQuantityType(.stepCount), metric: "step_count", unit: .count(), unitName: "count"),
        .init(type: HKQuantityType(.distanceWalkingRunning), metric: "distance_walking_running", unit: .meter(), unitName: "m"),
        .init(type: HKQuantityType(.distanceCycling), metric: "distance_cycling", unit: .meter(), unitName: "m"),
        .init(type: HKQuantityType(.flightsClimbed), metric: "flights_climbed", unit: .count(), unitName: "count"),
        .init(type: HKQuantityType(.appleExerciseTime), metric: "exercise_time", unit: .minute(), unitName: "min"),
        .init(type: HKQuantityType(.appleStandTime), metric: "stand_time", unit: .minute(), unitName: "min"),
        .init(type: HKQuantityType(.bodyMass), metric: "body_mass", unit: .gramUnit(with: .kilo), unitName: "kg"),
        .init(type: HKQuantityType(.oxygenSaturation), metric: "oxygen_saturation", unit: .percent(), unitName: "fraction"),
        .init(type: HKQuantityType(.vo2Max), metric: "vo2_max", unit: HKUnit(from: "ml/kg*min"), unitName: "ml_kg_min"),
        .init(type: HKQuantityType(.heartRateRecoveryOneMinute), metric: "cardio_recovery", unit: HKUnit.count().unitDivided(by: .minute()), unitName: "bpm"),
        .init(type: HKQuantityType(.runningSpeed), metric: "running_speed", unit: HKUnit.meter().unitDivided(by: .second()), unitName: "m/s"),
        .init(type: HKQuantityType(.runningStrideLength), metric: "running_stride", unit: .meter(), unitName: "m"),
        .init(type: HKQuantityType(.runningPower), metric: "running_power", unit: .watt(), unitName: "W"),
        .init(
            type: HKQuantityType(.runningVerticalOscillation),
            metric: "running_vertical_oscillation",
            unit: .meterUnit(with: .centi),
            unitName: "mm"
        ),
        .init(
            type: HKQuantityType(.runningGroundContactTime),
            metric: "running_ground_contact",
            unit: .second(),
            unitName: "ms"
        ),
    ]
}

private final class RowBox<T>: @unchecked Sendable {
    var items: [T] = []
}

private final class ResumeOnce: @unchecked Sendable {
    private var finished = false
    private let lock = NSLock()

    func resume(_ body: () -> Void) {
        lock.lock()
        defer { lock.unlock() }
        guard !finished else { return }
        finished = true
        body()
    }
}
