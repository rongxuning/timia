import Foundation
import os

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
    /// Legacy fixed overlap for time-window incremental when anchors are unavailable.
    static let overlap: TimeInterval = 2 * 60 * 60
    static let firstLookbackDays = 90
    static let uploadConcurrency = 4
    /// Heal / pre-anchor short lookback when anchors are missing or corrupt.
    static let backgroundLookbackDays = 2

    private static let log = Logger(subsystem: "online.timia.ios", category: "HealthSync")

    var api: HealthSyncAPI
    var store = HealthKitStore()
    var timezone: String = TimeZone.current.identifier
    var queue: HealthSyncQueue = .shared
    var anchorStore: HealthKitAnchorStore = .shared

    /// Time-window start. With healthy HK anchors, incremental sync does not use this (no 2h overlap).
    static func startDate(lastSyncedAt: Date?, anchorsHealthy: Bool = false) -> Date {
        if let lastSyncedAt {
            if anchorsHealthy {
                return lastSyncedAt
            }
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
    static func applyServerWatermark(_ server: Date?) async -> Date? {
        if let server {
            storeLastSyncedAt(server)
            return server
        }
        await clearLocalSyncState()
        return nil
    }

    static func clearLastSyncedAt() {
        UserDefaults.standard.removeObject(forKey: lastSyncedKey)
    }

    /// Clears local watermark, HK anchors, and durable outbox (clear-data / nil server watermark).
    static func clearLocalSyncState() async {
        clearLastSyncedAt()
        await HealthKitAnchorStore.shared.clearAll()
        try? await HealthSyncQueue.shared.clearAll()
    }

    static func anchorsHealthy() async -> Bool {
        await HealthKitAnchorStore.shared.hasHealthyAnchors(expectedKeys: HealthKitStore.anchorKeys)
    }

    /// Prefer the newer of local checkpoint vs server watermark so a lagging
    /// server stamp cannot wipe day-chunk progress after an interrupted sync.
    @available(*, deprecated, message: "Use applyServerWatermark; server is authoritative")
    static func mergeWatermark(local: Date?, server: Date?) async -> Date? {
        await applyServerWatermark(server ?? local)
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
        let exportStarted = Date()
        let export = try await store.exportSamples(from: start, to: end)
        HealthSyncTelemetry.logExport(exportMs: Int(Date().timeIntervalSince(exportStarted) * 1000))
        return export
    }

    /// Optional day export for the syncWindow prefetch pipeline (`nil` slice → `nil` export).
    private func exportDayIfNeeded(_ slice: (start: Date, end: Date)?) async throws -> HealthKitExport? {
        guard let slice else { return nil }
        return try await exportSince(slice.start, to: slice.end)
    }

    /// Chooses first-sync / anchored incremental / short-window heal.
    func syncFromWatermark(
        _ watermark: Date?,
        source: HealthSyncSource,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        if watermark == nil {
            var end = Date()
            let start = Self.startDate(lastSyncedAt: nil)
            try await syncWindow(from: start, to: end, source: source, onProgress: onProgress)
            // Catch up samples that arrived while the long first sync was running.
            let tip = Date()
            if tip.timeIntervalSince(end) > 60 {
                try await syncWindow(from: end, to: tip, source: source) { fraction, label in
                    onProgress(0.95 + 0.04 * fraction, label)
                }
                end = tip
            }
            onProgress(0.99, "保存增量锚点")
            try await persistCurrentAnchors(asOf: tip)
            return
        }

        if await Self.anchorsHealthy() {
            do {
                try await syncAnchored(source: source, onProgress: onProgress)
                return
            } catch HealthKitStoreError.needsAnchorHeal(let keys) {
                Self.log.warning(
                    "Anchor query failed for \(keys.joined(separator: ","), privacy: .public); healing"
                )
            }
        }

        // Heal: short time window once, then rewrite anchors (no 2h overlap semantics).
        let end = Date()
        let start = Calendar.current.date(
            byAdding: .day,
            value: -Self.backgroundLookbackDays,
            to: end
        ) ?? end.addingTimeInterval(-TimeInterval(Self.backgroundLookbackDays) * 24 * 3600)
        onProgress(0.02, "锚点修复 · 近 \(Self.backgroundLookbackDays) 天")
        try await syncWindow(from: start, to: end, source: source, onProgress: onProgress)
        try await persistCurrentAnchors(asOf: Date())
    }

    /// Incremental path: anchored export → enqueue → drain; no fixed 2h overlap.
    func syncAnchored(
        source: HealthSyncSource,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        let end = Date()
        onProgress(0.05, "读取增量变更")
        let exportStarted = Date()
        let (export, newAnchors) = try await store.exportAnchoredChanges()
        HealthSyncTelemetry.logExport(exportMs: Int(Date().timeIntervalSince(exportStarted) * 1000))

        onProgress(0.15, "写入队列")
        let enqueued = try await enqueueExportByLocalDate(export)
        // Advance anchors only after durable enqueue so a crash mid-drain still uploads.
        await anchorStore.saveAll(newAnchors)

        let drain = HealthSyncDrain(api: api, queue: queue)
        var upserted = 0
        if enqueued > 0 || (try await queue.pendingCount()) > 0 {
            while true {
                let remaining = try await queue.pendingCount()
                if remaining == 0 { break }
                let n = try await drain.drain(budget: .foreground) { step in
                    onProgress(min(0.95, 0.2 + Double(upserted) * 0.05), step)
                }
                upserted += n
                if n == 0 {
                    throw HealthSyncDrainError.noProgress(remaining: remaining)
                }
            }
        }

        let dates = Array(exportLocalDates(export)).sorted()
        for date in dates {
            await logFailedRowsLeftBehind(localDate: date, context: "syncAnchored")
        }
        if try await queue.pendingCount() == 0 {
            let stamped = try await api.checkpoint(toAt: Self.iso(end), timezone: timezone)
            if let server = Self.parseISO(stamped.lastSyncedAt) {
                Self.storeLastSyncedAt(server)
            } else {
                Self.storeLastSyncedAt(end)
            }
        }

        try await finish(
            source: source,
            start: end,
            end: end,
            quantityCount: export.samples.count,
            sleepCount: export.sleep.count,
            standHourCount: export.standHours.count,
            heartbeatCount: export.heartbeats.count,
            workoutCount: export.workouts.count,
            routeCount: export.routes.count,
            upserted: upserted,
            dates: dates
        )
        onProgress(1, "同步完成")
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
        let drain = HealthSyncDrain(api: api, queue: queue)
        /// Prefetched HealthKit export for the next day (memory only — never checkpoint early).
        var prefetchedNext: HealthKitExport? = nil

        for (index, slice) in slices.enumerated() {
            let dayIndex = index + 1
            let label = Self.dayLabel(for: slice.start)
            let base = Double(index) / Double(dayTotal)
            let span = 1.0 / Double(dayTotal)

            let export: HealthKitExport
            if let cached = prefetchedNext {
                prefetchedNext = nil
                onProgress(base, "使用预读取 \(dayIndex)/\(dayTotal) · \(label)")
                export = cached
            } else {
                onProgress(base, "正在读取 \(dayIndex)/\(dayTotal) · \(label)")
                export = try await exportSince(slice.start, to: slice.end)
            }
            quantityCount += export.samples.count
            sleepCount += export.sleep.count
            standHourCount += export.standHours.count
            heartbeatCount += export.heartbeats.count
            workoutCount += export.workouts.count
            routeCount += export.routes.count

            onProgress(base + span * 0.15, "\(dayIndex)/\(dayTotal) · \(label) · 写入队列")
            let enqueued = try await enqueueExport(export, localDate: label)
            for date in exportLocalDates(export) { localDates.insert(date) }

            // Pipeline: while draining day N, prefetch day N+1 into memory (no enqueue/checkpoint yet).
            let nextIndex = index + 1
            let nextSlice: (start: Date, end: Date)? = nextIndex < dayTotal ? slices[nextIndex] : nil
            if let nextSlice {
                let nextLabel = Self.dayLabel(for: nextSlice.start)
                onProgress(base + span * 0.18, "\(dayIndex)/\(dayTotal) · 预读取 \(nextLabel)")
            }
            async let nextDayExport = exportDayIfNeeded(nextSlice)

            // Drain until this day's outbox is empty before checkpointing.
            do {
                if enqueued > 0 || (try await queue.pendingCount(localDate: label)) > 0 {
                    var dayUploaded = 0
                    while true {
                        let remaining = try await queue.pendingCount(localDate: label)
                        if remaining == 0 { break }
                        let n = try await drain.drain(budget: .foreground) { step in
                            onProgress(
                                base + span * (0.2 + 0.75 * min(1, Double(dayUploaded + 1) / Double(max(remaining, 1)))),
                                "\(dayIndex)/\(dayTotal) · \(label) · \(step)"
                            )
                        }
                        dayUploaded += n
                        upserted += n
                        if n == 0 {
                            let still = try await queue.pendingCount(localDate: label)
                            throw HealthSyncDrainError.noProgress(remaining: still)
                        }
                    }
                }

                // Server-authoritative day checkpoint (local cache mirrors server).
                // Only day N — prefetched N+1 stays in memory until its own turn.
                await logFailedRowsLeftBehind(localDate: label, context: "syncWindow")
                let stamped = try await api.checkpoint(toAt: Self.iso(slice.end), timezone: timezone)
                if let server = Self.parseISO(stamped.lastSyncedAt) {
                    Self.storeLastSyncedAt(server)
                } else {
                    Self.storeLastSyncedAt(slice.end)
                }
                onProgress(base + span, "已完成 \(dayIndex)/\(dayTotal) · \(label)")

                prefetchedNext = try await nextDayExport
            } catch {
                // Drain/checkpoint failed: still await prefetch so work is not abandoned mid-flight.
                prefetchedNext = try? await nextDayExport
                throw error
            }
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

    /// Background: anchored export → enqueue → budgeted drain. Heals with a 2-day window when anchors are unhealthy.
    func syncBackgroundBudgeted(
        budget: HealthSyncDrainBudget = .background,
        onProgress: ((String) -> Void)? = nil
    ) async throws -> Int {
        let end = Date()

        if await Self.anchorsHealthy() {
            do {
                return try await syncBackgroundAnchored(budget: budget, end: end, onProgress: onProgress)
            } catch HealthKitStoreError.needsAnchorHeal(let keys) {
                Self.log.warning(
                    "Background anchor failure for \(keys.joined(separator: ","), privacy: .public); healing"
                )
            }
        }

        return try await syncBackgroundHeal(budget: budget, end: end, onProgress: onProgress)
    }

    private func syncBackgroundAnchored(
        budget: HealthSyncDrainBudget,
        end: Date,
        onProgress: ((String) -> Void)?
    ) async throws -> Int {
        onProgress?("后台增量导出")
        let exportStarted = Date()
        let (export, newAnchors) = try await store.exportAnchoredChanges()
        HealthSyncTelemetry.logExport(exportMs: Int(Date().timeIntervalSince(exportStarted) * 1000))
        _ = try await enqueueExportByLocalDate(export)
        await anchorStore.saveAll(newAnchors)

        let drain = HealthSyncDrain(api: api, queue: queue)
        let uploaded = try await drain.drain(budget: budget, onProgress: onProgress)

        let dates = Array(exportLocalDates(export)).sorted()
        if dates.isEmpty {
            if try await queue.pendingCount() == 0 {
                await checkpointTo(end, context: "syncBackgroundAnchored")
            }
        } else {
            for date in dates {
                let remaining = try await queue.pendingCount(localDate: date)
                guard remaining == 0 else { break }
                await logFailedRowsLeftBehind(localDate: date, context: "syncBackgroundAnchored")
                // Checkpoint through end of that local calendar day (or `end` for today).
                let dayEnd = min(end, Self.endOfLocalDay(date) ?? end)
                await checkpointTo(dayEnd, context: "syncBackgroundAnchored")
            }
        }

        return uploaded
    }

    private func syncBackgroundHeal(
        budget: HealthSyncDrainBudget,
        end: Date,
        onProgress: ((String) -> Void)?
    ) async throws -> Int {
        let start = Calendar.current.date(
            byAdding: .day,
            value: -Self.backgroundLookbackDays,
            to: end
        ) ?? end.addingTimeInterval(-TimeInterval(Self.backgroundLookbackDays) * 24 * 3600)

        let slices = Self.daySlices(from: start, to: end)
        for slice in slices {
            let label = Self.dayLabel(for: slice.start)
            onProgress?("后台修复导出 \(label)")
            let export = try await exportSince(slice.start, to: slice.end)
            _ = try await enqueueExport(export, localDate: label)
        }

        let drain = HealthSyncDrain(api: api, queue: queue)
        let uploaded = try await drain.drain(budget: budget, onProgress: onProgress)

        for slice in slices {
            let label = Self.dayLabel(for: slice.start)
            let remaining = try await queue.pendingCount(localDate: label)
            guard remaining == 0 else { break }
            await logFailedRowsLeftBehind(localDate: label, context: "syncBackgroundHeal")
            await checkpointTo(slice.end, context: "syncBackgroundHeal")
        }

        // Rewrite anchors after heal export is enqueued (even if drain partially incomplete).
        try await persistCurrentAnchors(asOf: Date())
        return uploaded
    }

    func persistCurrentAnchors(asOf date: Date = Date()) async throws {
        let anchors = try await store.captureCurrentAnchors(asOf: date)
        await anchorStore.saveAll(anchors)
    }

    private func checkpointTo(_ date: Date, context: String) async {
        do {
            let stamped = try await api.checkpoint(toAt: Self.iso(date), timezone: timezone)
            if let server = Self.parseISO(stamped.lastSyncedAt) {
                Self.storeLastSyncedAt(server)
            } else {
                Self.storeLastSyncedAt(date)
            }
        } catch {
            Self.log.error("Checkpoint failed (\(context, privacy: .public)): \(error.localizedDescription, privacy: .public)")
        }
    }

    private static func endOfLocalDay(_ localDate: String) -> Date? {
        let parts = localDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var comps = DateComponents()
        comps.year = parts[0]
        comps.month = parts[1]
        comps.day = parts[2]
        comps.hour = 23
        comps.minute = 59
        comps.second = 59
        return Calendar.current.date(from: comps)
    }

    func upload(
        _ export: HealthKitExport,
        source: HealthSyncSource,
        from start: Date,
        to end: Date,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        let label = Self.dayLabel(for: start)
        onProgress(0.1, "写入队列")
        _ = try await enqueueExport(export, localDate: label)
        let drain = HealthSyncDrain(api: api, queue: queue)
        var uploaded = 0
        while true {
            let remaining = try await queue.pendingCount(localDate: label)
            if remaining == 0 { break }
            let n = try await drain.drain(budget: .foreground) { step in
                onProgress(min(0.95, 0.2 + Double(uploaded) * 0.05), step)
            }
            uploaded += n
            if n == 0 {
                throw HealthSyncDrainError.noProgress(remaining: remaining)
            }
        }
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
            upserted: uploaded,
            dates: Array(exportLocalDates(export)).sorted()
        )
        onProgress(1, "同步完成")
    }

    /// Chunk export into outbox rows. Category order: deletions→samples→sleep→stand→workouts→routes→heartbeats.
    @discardableResult
    func enqueueExport(_ export: HealthKitExport, localDate: String) async throws -> Int {
        let tz = timezone
        var count = 0

        func enqueue<T: Encodable>(
            _ category: HealthSyncOutboxCategory,
            payload: T
        ) async throws {
            let data = try HealthSyncDrain.encodePayload(payload)
            try await queue.enqueue(category: category, localDate: localDate, payload: data)
            count += 1
        }

        // Deletions first (≤500) so drain uploads soft-deletes before upserts.
        let deletionItems = export.deletions.map {
            HealthDeletionItemPayload(hkUuid: $0.hkUuid, kind: $0.kind)
        }
        for chunk in deletionItems.chunked(into: 500) {
            try await enqueue(
                .deletions,
                payload: HealthDeletionSyncPayload(timezone: tz, deletions: chunk)
            )
        }
        for chunk in export.samples.chunked(into: 500) {
            try await enqueue(.samples, payload: HealthQuantitySyncPayload(timezone: tz, samples: chunk))
        }
        for chunk in export.sleep.chunked(into: 200) {
            try await enqueue(.sleep, payload: HealthSleepSyncPayload(timezone: tz, samples: chunk))
        }
        for chunk in export.standHours.chunked(into: 200) {
            try await enqueue(.standHours, payload: HealthStandHourSyncPayload(timezone: tz, samples: chunk))
        }
        for chunk in export.workouts.chunked(into: 50) {
            try await enqueue(.workouts, payload: HealthWorkoutSyncPayload(timezone: tz, workouts: chunk))
        }
        for chunk in export.routes.chunked(into: 10) {
            try await enqueue(.routes, payload: HealthWorkoutRouteSyncPayload(timezone: tz, routes: chunk))
        }
        for chunk in export.heartbeats.chunked(into: 20) {
            try await enqueue(.heartbeats, payload: HealthHeartbeatSyncPayload(timezone: tz, series: chunk))
        }

        return count
    }

    /// Split an anchored (or multi-day) export into per-local-date outbox rows.
    /// Deletions have no sample timestamps — enqueued once under today's local date, before day buckets.
    @discardableResult
    func enqueueExportByLocalDate(_ export: HealthKitExport) async throws -> Int {
        var total = 0

        if !export.deletions.isEmpty {
            let deletionOnly = HealthKitExport(
                samples: [],
                sleep: [],
                standHours: [],
                workouts: [],
                routes: [],
                heartbeats: [],
                deletions: export.deletions
            )
            total += try await enqueueExport(deletionOnly, localDate: Self.dayLabel(for: Date()))
        }

        var byDate: [String: HealthKitExport] = [:]

        func bucket(_ iso: String) -> String { Self.localDay(of: iso) }

        for sample in export.samples {
            let key = bucket(sample.endAt)
            var day = byDate[key] ?? HealthKitExport(
                samples: [], sleep: [], standHours: [], workouts: [], routes: [], heartbeats: [], deletions: []
            )
            day.samples.append(sample)
            byDate[key] = day
        }
        for sample in export.sleep {
            let key = bucket(sample.endAt)
            var day = byDate[key] ?? HealthKitExport(
                samples: [], sleep: [], standHours: [], workouts: [], routes: [], heartbeats: [], deletions: []
            )
            day.sleep.append(sample)
            byDate[key] = day
        }
        for sample in export.standHours {
            let key = bucket(sample.endAt)
            var day = byDate[key] ?? HealthKitExport(
                samples: [], sleep: [], standHours: [], workouts: [], routes: [], heartbeats: [], deletions: []
            )
            day.standHours.append(sample)
            byDate[key] = day
        }
        for sample in export.heartbeats {
            let key = bucket(sample.endAt)
            var day = byDate[key] ?? HealthKitExport(
                samples: [], sleep: [], standHours: [], workouts: [], routes: [], heartbeats: [], deletions: []
            )
            day.heartbeats.append(sample)
            byDate[key] = day
        }
        for workout in export.workouts {
            let key = bucket(workout.endAt)
            var day = byDate[key] ?? HealthKitExport(
                samples: [], sleep: [], standHours: [], workouts: [], routes: [], heartbeats: [], deletions: []
            )
            day.workouts.append(workout)
            byDate[key] = day
        }
        for route in export.routes {
            // Routes share workout hk_uuid; attach to matching workout day when possible.
            let key = byDate.first(where: { _, exp in
                exp.workouts.contains { $0.hkUuid == route.hkUuid }
            })?.key ?? Self.dayLabel(for: Date())
            var day = byDate[key] ?? HealthKitExport(
                samples: [], sleep: [], standHours: [], workouts: [], routes: [], heartbeats: [], deletions: []
            )
            day.routes.append(route)
            byDate[key] = day
        }

        for date in byDate.keys.sorted() {
            guard let dayExport = byDate[date] else { continue }
            total += try await enqueueExport(dayExport, localDate: date)
        }
        return total
    }

    private func exportLocalDates(_ export: HealthKitExport) -> Set<String> {
        var dates = Set<String>()
        for sample in export.samples { dates.insert(Self.localDay(of: sample.endAt)) }
        for sample in export.sleep { dates.insert(Self.localDay(of: sample.endAt)) }
        for sample in export.standHours { dates.insert(Self.localDay(of: sample.endAt)) }
        for sample in export.heartbeats { dates.insert(Self.localDay(of: sample.endAt)) }
        for workout in export.workouts { dates.insert(Self.localDay(of: workout.endAt)) }
        return dates
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

    private func logFailedRowsLeftBehind(localDate: String, context: String) async {
        guard let failed = try? await queue.failedCount(localDate: localDate), failed > 0 else { return }
        Self.log.warning(
            "Checkpointing \(localDate, privacy: .public) with \(failed) failed outbox row(s) left behind (\(context, privacy: .public))"
        )
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
