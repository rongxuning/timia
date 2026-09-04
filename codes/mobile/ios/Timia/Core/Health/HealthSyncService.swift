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
    static let uploadConcurrency = 4

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

    /// Apply server watermark as the sole authority. Nil server clears local cache
    /// so Web「清除」后 App 会重新全量同步。
    @discardableResult
    static func applyServerWatermark(_ server: Date?) -> Date? {
        if let server {
            storeLastSyncedAt(server)
            return server
        }
        clearLastSyncedAt()
        return nil
    }

    static func clearLastSyncedAt() {
        UserDefaults.standard.removeObject(forKey: lastSyncedKey)
    }

    /// Prefer the newer of local checkpoint vs server watermark so a lagging
    /// server stamp cannot wipe day-chunk progress after an interrupted sync.
    @available(*, deprecated, message: "Use applyServerWatermark; server is authoritative")
    static func mergeWatermark(local: Date?, server: Date?) -> Date? {
        applyServerWatermark(server ?? local)
    }

    static func daySlices(from start: Date, to end: Date, calendar: Calendar = .current) -> [(start: Date, end: Date)] {
        guard start < end else { return [] }
        var slices: [(start: Date, end: Date)] = []
        var cursor = start
        while cursor < end {
            let dayStart = calendar.startOfDay(for: cursor)
            let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? end
            let sliceEnd = min(nextDay, end)
            slices.append((cursor, sliceEnd))
            cursor = sliceEnd
        }
        return slices
    }

    static func dayLabel(for date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
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
        let slices = Self.daySlices(from: start, to: end)
        guard !slices.isEmpty else {
            onProgress(1, "没有需要同步的时间范围")
            try await finish(
                source: source,
                start: start,
                end: end,
                quantityCount: 0,
                sleepCount: 0,
                standHourCount: 0,
                heartbeatCount: 0,
                workoutCount: 0,
                routeCount: 0,
                upserted: 0,
                dates: []
            )
            return
        }

        var upserted = 0
        var quantityCount = 0
        var sleepCount = 0
        var standHourCount = 0
        var heartbeatCount = 0
        var workoutCount = 0
        var routeCount = 0
        var localDates: Set<String> = []
        let dayTotal = slices.count

        for (index, slice) in slices.enumerated() {
            let dayIndex = index + 1
            let label = Self.dayLabel(for: slice.start)
            let base = Double(index) / Double(dayTotal)
            let span = 1.0 / Double(dayTotal)

            onProgress(base, "正在读取 \(dayIndex)/\(dayTotal) · \(label)")
            let export = try await exportSince(slice.start, to: slice.end)
            quantityCount += export.samples.count
            sleepCount += export.sleep.count
            standHourCount += export.standHours.count
            heartbeatCount += export.heartbeats.count
            workoutCount += export.workouts.count
            routeCount += export.routes.count

            let dayResult = try await uploadBatches(export, onProgress: { fraction, step in
                onProgress(base + span * fraction * 0.95, "\(dayIndex)/\(dayTotal) · \(label) · \(step)")
            })
            upserted += dayResult.upserted
            for date in dayResult.localDates { localDates.insert(date) }

            // Server-authoritative day checkpoint (local cache mirrors server).
            let stamped = try await api.checkpoint(toAt: Self.iso(slice.end))
            if let server = Self.parseISO(stamped.lastSyncedAt) {
                Self.storeLastSyncedAt(server)
            } else {
                Self.storeLastSyncedAt(slice.end)
            }
            onProgress(base + span, "已完成 \(dayIndex)/\(dayTotal) · \(label)")
        }

        try await finish(
            source: source,
            start: start,
            end: end,
            quantityCount: quantityCount,
            sleepCount: sleepCount,
            standHourCount: standHourCount,
            heartbeatCount: heartbeatCount,
            workoutCount: workoutCount,
            routeCount: routeCount,
            upserted: upserted,
            dates: Array(localDates).sorted()
        )
        onProgress(1, "同步完成")
    }

    func upload(
        _ export: HealthKitExport,
        source: HealthSyncSource,
        from start: Date,
        to end: Date,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        let result = try await uploadBatches(export, onProgress: onProgress)
        try await finish(
            source: source,
            start: start,
            end: end,
            quantityCount: export.samples.count,
            sleepCount: export.sleep.count,
            standHourCount: export.standHours.count,
            heartbeatCount: export.heartbeats.count,
            workoutCount: export.workouts.count,
            routeCount: export.routes.count,
            upserted: result.upserted,
            dates: Array(result.localDates).sorted()
        )
        onProgress(1, "同步完成")
    }

    private struct UploadBatchResult {
        var upserted: Int
        var localDates: Set<String>
    }

    private func uploadBatches(
        _ export: HealthKitExport,
        onProgress: @escaping (Double, String) -> Void
    ) async throws -> UploadBatchResult {
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

        if sampleBatches.isEmpty, sleepBatches.isEmpty, standBatches.isEmpty,
           workoutBatches.isEmpty, routeBatches.isEmpty, heartbeatBatches.isEmpty {
            onProgress(1, "无样本")
            return UploadBatchResult(upserted: 0, localDates: [])
        }

        struct Category: Sendable {
            let label: String
            let count: Int
            let run: @Sendable (Int) async throws -> HealthSyncOut
        }

        let api = self.api
        let tz = self.timezone
        let categories: [Category] = [
            Category(label: "指标", count: sampleBatches.count) { index in
                try await api.syncSamples(
                    HealthQuantitySyncPayload(timezone: tz, samples: sampleBatches[index])
                )
            },
            Category(label: "睡眠", count: sleepBatches.count) { index in
                try await api.syncSleep(
                    HealthSleepSyncPayload(timezone: tz, samples: sleepBatches[index])
                )
            },
            Category(label: "站立", count: standBatches.count) { index in
                try await api.syncStandHours(
                    HealthStandHourSyncPayload(timezone: tz, samples: standBatches[index])
                )
            },
            Category(label: "训练", count: workoutBatches.count) { index in
                try await api.syncWorkouts(
                    HealthWorkoutSyncPayload(timezone: tz, workouts: workoutBatches[index])
                )
            },
            Category(label: "路线", count: routeBatches.count) { index in
                try await api.syncWorkoutRoutes(
                    HealthWorkoutRouteSyncPayload(timezone: tz, routes: routeBatches[index])
                )
            },
            Category(label: "心跳", count: heartbeatBatches.count) { index in
                try await api.syncHeartbeat(
                    HealthHeartbeatSyncPayload(timezone: tz, series: heartbeatBatches[index])
                )
            },
        ]

        let aggregator = ResultAggregator()
        let totalBox = TotalBox(value: total)
        let cap = Self.uploadConcurrency

        // Categories stay ordered so workouts land before routes (route upsert needs session).
        for category in categories where category.count > 0 {
            try await withThrowingTaskGroup(of: Void.self) { group in
                var inflight = 0
                for index in 0..<category.count {
                    let label = "\(category.label) \(index + 1)/\(category.count)"
                    let run = category.run
                    group.addTask { [aggregator, totalBox, label] in
                        let out = try await run(index)
                        await aggregator.absorb(out)
                        await totalBox.bump(label: label)
                    }
                    inflight += 1
                    if inflight >= cap {
                        _ = try await group.next()
                        inflight -= 1
                        let s = await totalBox.snapshot()
                        onProgress(Double(s.done) / Double(s.total), s.label)
                    }
                }
                while inflight > 0 {
                    _ = try await group.next()
                    inflight -= 1
                    let s = await totalBox.snapshot()
                    onProgress(Double(s.done) / Double(s.total), s.label)
                }
            }
        }

        let (upserted, localDates) = await aggregator.snapshot()
        return UploadBatchResult(upserted: upserted, localDates: localDates)
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
        quantityCount: Int,
        sleepCount: Int,
        standHourCount: Int,
        heartbeatCount: Int,
        workoutCount: Int,
        routeCount: Int,
        upserted: Int,
        dates: [String]
    ) async throws {
        _ = try await api.finishRun(
            HealthSyncRunIn(
                source: source.rawValue,
                status: "success",
                fromAt: Self.iso(start),
                toAt: Self.iso(end),
                quantityCount: quantityCount,
                sleepCount: sleepCount,
                standHourCount: standHourCount,
                heartbeatSeriesCount: heartbeatCount,
                workoutCount: workoutCount,
                routeCount: routeCount,
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

private actor ResultAggregator {
    private var upserted = 0
    private var localDates = Set<String>()

    func absorb(_ result: HealthSyncOut) {
        upserted += result.upserted
        for date in result.localDates { localDates.insert(date) }
    }

    func snapshot() -> (Int, Set<String>) {
        (upserted, localDates)
    }
}

private actor TotalBox {
    let total: Int
    private var done: Int = 0
    private var lastLabel: String = ""

    init(value: Int) { self.total = max(value, 1) }

    func bump(label: String) {
        done += 1
        lastLabel = label
    }

    func snapshot() -> (done: Int, total: Int, label: String) {
        (done, total, lastLabel)
    }
}
