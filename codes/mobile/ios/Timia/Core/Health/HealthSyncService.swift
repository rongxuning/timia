import Foundation

struct HealthPendingDay: Identifiable, Sendable {
    var localDate: String
    var quantityCount: Int
    var sleepCount: Int
    var standHourCount: Int
    var heartbeatCount: Int
    var workouts: [HealthWorkoutPayload]

    var id: String { localDate }

    var summary: String {
        var parts: [String] = []
        if quantityCount > 0 { parts.append("指标 \(quantityCount)") }
        if sleepCount > 0 { parts.append("睡眠 \(sleepCount)") }
        if standHourCount > 0 { parts.append("站立 \(standHourCount)") }
        if heartbeatCount > 0 { parts.append("心跳序列 \(heartbeatCount)") }
        if workouts.count > 0 { parts.append("训练 \(workouts.count)") }
        return parts.isEmpty ? "无样本" : parts.joined(separator: " · ")
    }
}

enum HealthSyncSource: String, Sendable {
    case manual
    case background
}

@MainActor
struct HealthSyncService {
    static let lastSyncedKey = "timia.health.lastSyncedAt"
    static let overlap: TimeInterval = 2 * 60 * 60
    static let firstLookbackDays = 90

    var api: HealthSyncAPI
    var store = HealthKitStore()
    var timezone: String = TimeZone.current.identifier

    static func startDate(lastSyncedAt: Date?) -> Date {
        if let lastSyncedAt {
            return lastSyncedAt.addingTimeInterval(-overlap)
        }
        return Calendar.current.date(byAdding: .day, value: -firstLookbackDays, to: Date()) ?? Date()
    }

    static func cachedLastSyncedAt() -> Date? {
        guard let raw = UserDefaults.standard.string(forKey: lastSyncedKey) else {
            if let legacy = UserDefaults.standard.object(forKey: "timia.health.lastManualSyncAt") as? Date {
                return legacy
            }
            return UserDefaults.standard.object(forKey: "timia.health.observerAnchorDate") as? Date
        }
        return parseISO(raw)
    }

    static func storeLastSyncedAt(_ date: Date) {
        UserDefaults.standard.set(iso(date), forKey: lastSyncedKey)
    }

    func exportSince(_ start: Date, to end: Date = Date()) async throws -> HealthKitExport {
        try await store.exportSamples(from: start, to: end)
    }

    func syncWindow(
        from start: Date,
        to end: Date = Date(),
        source: HealthSyncSource,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        onProgress(0.05, "正在读取健康数据…")
        let export = try await exportSince(start, to: end)
        try await upload(export, source: source, from: start, to: end, onProgress: onProgress)
    }

    func upload(
        _ export: HealthKitExport,
        source: HealthSyncSource,
        from start: Date,
        to end: Date,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        let sampleBatches = export.samples.chunked(into: 500)
        let sleepBatches = export.sleep.chunked(into: 200)
        let standBatches = export.standHours.chunked(into: 200)
        let workoutBatches = export.workouts.chunked(into: 50)
        let routeBatches = export.routes.chunked(into: 10)
        let heartbeatBatches = export.heartbeats.chunked(into: 20)
        let total = max(
            sampleBatches.count + sleepBatches.count + standBatches.count
                + workoutBatches.count + routeBatches.count + heartbeatBatches.count,
            1
        )
        var done = 0
        var upserted = 0
        var localDates: Set<String> = []

        func step(_ label: String) {
            done += 1
            onProgress(Double(done) / Double(total), label)
        }

        func absorb(_ result: HealthSyncOut) {
            upserted += result.upserted
            for date in result.localDates { localDates.insert(date) }
        }

        if sampleBatches.isEmpty, sleepBatches.isEmpty, standBatches.isEmpty,
           workoutBatches.isEmpty, routeBatches.isEmpty, heartbeatBatches.isEmpty {
            onProgress(1, "没有需要上传的数据")
            try await finish(source: source, start: start, end: end, export: export, upserted: 0, dates: [])
            return
        }

        for batch in sampleBatches {
            absorb(try await api.syncSamples(HealthQuantitySyncPayload(timezone: timezone, samples: batch)))
            step("正在同步指标 \(done)/\(total)")
        }
        for batch in sleepBatches {
            absorb(try await api.syncSleep(HealthSleepSyncPayload(timezone: timezone, samples: batch)))
            step("正在同步睡眠 \(done)/\(total)")
        }
        for batch in standBatches {
            absorb(try await api.syncStandHours(HealthStandHourSyncPayload(timezone: timezone, samples: batch)))
            step("正在同步站立 \(done)/\(total)")
        }
        for batch in workoutBatches {
            absorb(try await api.syncWorkouts(HealthWorkoutSyncPayload(timezone: timezone, workouts: batch)))
            step("正在同步训练 \(done)/\(total)")
        }
        for batch in routeBatches {
            absorb(try await api.syncWorkoutRoutes(HealthWorkoutRouteSyncPayload(timezone: timezone, routes: batch)))
            step("正在同步路线 \(done)/\(total)")
        }
        for batch in heartbeatBatches {
            absorb(try await api.syncHeartbeat(HealthHeartbeatSyncPayload(timezone: timezone, series: batch)))
            step("正在同步心跳序列 \(done)/\(total)")
        }
        try await finish(
            source: source,
            start: start,
            end: end,
            export: export,
            upserted: upserted,
            dates: Array(localDates).sorted()
        )
        onProgress(1, "同步完成")
    }

    static func pendingDays(from export: HealthKitExport) -> [HealthPendingDay] {
        var buckets: [String: HealthPendingDay] = [:]

        func bucket(_ iso: String) -> HealthPendingDay {
            let key = localDay(of: iso)
            return buckets[key] ?? HealthPendingDay(
                localDate: key,
                quantityCount: 0,
                sleepCount: 0,
                standHourCount: 0,
                heartbeatCount: 0,
                workouts: []
            )
        }

        for sample in export.samples {
            var item = bucket(sample.endAt)
            item.quantityCount += 1
            buckets[item.localDate] = item
        }
        for sample in export.sleep {
            var item = bucket(sample.endAt)
            item.sleepCount += 1
            buckets[item.localDate] = item
        }
        for sample in export.standHours {
            var item = bucket(sample.endAt)
            item.standHourCount += 1
            buckets[item.localDate] = item
        }
        for sample in export.heartbeats {
            var item = bucket(sample.endAt)
            item.heartbeatCount += 1
            buckets[item.localDate] = item
        }
        for workout in export.workouts {
            var item = bucket(workout.endAt)
            item.workouts.append(workout)
            buckets[item.localDate] = item
        }

        return buckets.values.sorted { $0.localDate > $1.localDate }
    }

    private func finish(
        source: HealthSyncSource,
        start: Date,
        end: Date,
        export: HealthKitExport,
        upserted: Int,
        dates: [String]
    ) async throws {
        _ = try await api.finishRun(
            HealthSyncRunIn(
                source: source.rawValue,
                status: "success",
                fromAt: Self.iso(start),
                toAt: Self.iso(end),
                quantityCount: export.samples.count,
                sleepCount: export.sleep.count,
                standHourCount: export.standHours.count,
                heartbeatSeriesCount: export.heartbeats.count,
                workoutCount: export.workouts.count,
                routeCount: export.routes.count,
                upserted: upserted,
                localDates: dates,
                error: nil
            )
        )
        Self.storeLastSyncedAt(end)
    }

    static func iso(_ date: Date) -> String {
        date.ISO8601Format()
    }

    static func parseISO(_ raw: String) -> Date? {
        if let date = try? Date(raw, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
            return date
        }
        return try? Date(raw, strategy: .iso8601)
    }

    private static func localDay(of iso: String) -> String {
        let date = parseISO(iso)
        guard let date else { return String(iso.prefix(10)) }
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

extension HealthWorkoutPayload {
    var activityTitle: String {
        HealthKitStore.activityTitle(activityType)
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0, !isEmpty else { return [] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}
