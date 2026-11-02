import Foundation
import os

struct WorkoutPendingItem: Identifiable, Sendable {
    var workout: HealthWorkoutPayload
    var id: String { workout.hkUuid }
}

struct WorkoutSyncService {
    static let lastSyncedKey = "timia.workout.lastSyncedAt"
    static let pipeline = "workout"
    static let firstLookbackDays = 90
    /// Background and catch-up heals stay short. The 90-day window stays on the manual path.
    static let backgroundLookbackDays = 2
    static let chunkSize = 20

    private static let log = Logger(subsystem: "online.timia.ios", category: "WorkoutSync")

    var api: HealthSyncAPI
    var store = HealthKitStore()
    var timezone: String = TimeZone.current.identifier
    var anchorStore: HealthKitAnchorStore = .shared

    static func cachedLastSyncedAt() -> Date? {
        guard let raw = UserDefaults.standard.string(forKey: lastSyncedKey) else { return nil }
        return HealthSyncService.parseISO(raw)
    }

    static func storeLastSyncedAt(_ date: Date) {
        UserDefaults.standard.set(HealthSyncService.iso(date), forKey: lastSyncedKey)
    }

    static func clearLastSyncedAt() {
        UserDefaults.standard.removeObject(forKey: lastSyncedKey)
    }

    @discardableResult
    static func applyServerWatermark(_ server: Date?) async -> Date? {
        if let server {
            storeLastSyncedAt(server)
            return server
        }
        clearLastSyncedAt()
        await HealthKitAnchorStore.shared.remove(key: "workout")
        return nil
    }

    static func anchorsHealthy() async -> Bool {
        await HealthKitAnchorStore.shared.hasHealthyAnchors(expectedKeys: HealthKitStore.workoutAnchorKeys)
    }

    func listPending() async throws -> [WorkoutPendingItem] {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -Self.firstLookbackDays, to: end) ?? end
        let local = try await store.exportWorkouts(from: start, to: end)
        let remote = try await api.workoutUuids(timezone: timezone)
        let remoteSet = Set(remote.hkUuids.map { $0.lowercased() })
        return local.workouts
            .filter { !remoteSet.contains($0.hkUuid.lowercased()) }
            .sorted { $0.startAt > $1.startAt }
            .map { WorkoutPendingItem(workout: $0) }
    }

    func syncFromWatermark(
        _ watermark: Date?,
        source: HealthSyncSource,
        onlyHkUuid: String? = nil,
        skipGlobalCheckpoint: Bool = false,
        onProgress: HealthSyncProgress
    ) async throws {
        let report: @Sendable (Double, String) -> Void = { fraction, label in
            onProgress(fraction, label)
        }
        let anchorsHealthy = await Self.anchorsHealthy()
        if watermark == nil || onlyHkUuid != nil || !anchorsHealthy {
            try await syncWindow(
                source: source,
                onlyHkUuid: onlyHkUuid,
                skipGlobalCheckpoint: skipGlobalCheckpoint || onlyHkUuid != nil,
                onProgress: report
            )
            if watermark == nil {
                try await persistCurrentAnchors()
            }
            return
        }

        do {
            try await syncAnchored(source: source, onProgress: report)
        } catch HealthKitStoreError.needsAnchorHeal {
            try await syncWindow(
                source: source,
                skipGlobalCheckpoint: skipGlobalCheckpoint,
                onProgress: report
            )
            try await persistCurrentAnchors()
        }
    }

    /// Incremental when anchors are healthy. An unhealthy anchor used to scan `firstLookbackDays`
    /// and could consume the whole background window; that path now uses `backgroundLookbackDays`
    /// and does not advance anchors, so a later manual sync can still heal the full lookback.
    func syncBackgroundBudgeted(
        deadline: Date,
        shouldStop: @Sendable () -> Bool = { false }
    ) async throws {
        guard Self.cachedLastSyncedAt() != nil else { return }
        guard !shouldStop(), BackgroundWakeBudget.shouldStartSlice(deadline: deadline) else {
            Self.log.info("Background workout sync skipped; shared budget exhausted")
            return
        }
        if await Self.anchorsHealthy() {
            do {
                try await syncAnchored(
                    source: .background,
                    deadline: deadline,
                    shouldStop: shouldStop,
                    onProgress: { _, _ in }
                )
                return
            } catch HealthKitStoreError.needsAnchorHeal {
                Self.log.warning("Workout anchor query failed; falling back to the short background window")
            }
        } else {
            Self.log.warning(
                "Workout anchors unhealthy; background sync limited to \(Self.backgroundLookbackDays, privacy: .public) days"
            )
        }
        try await syncWindow(
            source: .background,
            lookbackDays: Self.backgroundLookbackDays,
            deadline: deadline,
            shouldStop: shouldStop,
            skipGlobalCheckpoint: true,
            onProgress: { _, _ in }
        )
    }

    private func syncAnchored(
        source: HealthSyncSource,
        deadline: Date? = nil,
        shouldStop: @Sendable () -> Bool = { false },
        onProgress: @escaping @Sendable (Double, String) -> Void
    ) async throws {
        if shouldStop() { return }
        if let deadline, !BackgroundWakeBudget.shouldStartSlice(deadline: deadline) { return }
        onProgress(0.1, "读取训练增量")
        let (export, newAnchors) = try await store.exportWorkoutAnchoredChanges()
        onProgress(0.3, "上传训练")
        let outcome = try await upload(
            workouts: export.workouts,
            routes: export.routes,
            deletions: export.deletions,
            deadline: deadline,
            shouldStop: shouldStop,
            onProgress: onProgress
        )
        guard !outcome.truncated else {
            Self.log.warning("Workout anchored upload hit the shared wake budget; anchors were not advanced")
            return
        }
        let upserted = outcome.upserted
        await anchorStore.saveAll(newAnchors)
        let syncedAt = Date()
        let stamped = try await api.checkpoint(
            toAt: HealthSyncService.iso(syncedAt),
            timezone: timezone,
            pipeline: Self.pipeline
        )
        if let server = stamped.lastWorkoutSyncedAt.flatMap(HealthSyncService.parseISO) {
            Self.storeLastSyncedAt(server)
        } else {
            Self.storeLastSyncedAt(syncedAt)
        }
        try await finish(
            source: source,
            workouts: export.workouts,
            routeCount: export.routes.count,
            upserted: upserted,
            syncedAt: syncedAt
        )
        onProgress(1, "训练同步完成")
    }

    private func syncWindow(
        source: HealthSyncSource,
        onlyHkUuid: String? = nil,
        lookbackDays: Int = Self.firstLookbackDays,
        deadline: Date? = nil,
        shouldStop: @Sendable () -> Bool = { false },
        skipGlobalCheckpoint: Bool = false,
        onProgress: @escaping @Sendable (Double, String) -> Void
    ) async throws {
        if shouldStop() { return }
        if let deadline, !BackgroundWakeBudget.shouldStartSlice(deadline: deadline) { return }
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -lookbackDays, to: end) ?? end
        onProgress(0.05, "读取近 \(lookbackDays) 天训练")
        var export = try await store.exportWorkouts(from: start, to: end)
        if let onlyHkUuid {
            let key = onlyHkUuid.lowercased()
            export.workouts = export.workouts.filter { $0.hkUuid.lowercased() == key }
            export.routes = export.routes.filter { $0.hkUuid.lowercased() == key }
        } else {
            let remote = try await api.workoutUuids(timezone: timezone)
            let remoteSet = Set(remote.hkUuids.map { $0.lowercased() })
            let pending = export.workouts.filter { !remoteSet.contains($0.hkUuid.lowercased()) }
            let pendingIds = Set(pending.map { $0.hkUuid.lowercased() })
            export.workouts = pending
            export.routes = export.routes.filter { pendingIds.contains($0.hkUuid.lowercased()) }
        }

        let outcome = try await upload(
            workouts: export.workouts,
            routes: export.routes,
            deletions: [],
            deadline: deadline,
            shouldStop: shouldStop,
            onProgress: onProgress
        )
        if outcome.truncated {
            Self.log.warning("Workout window upload hit the shared wake budget")
            return
        }
        let upserted = outcome.upserted
        if !skipGlobalCheckpoint {
            let stamped = try await api.checkpoint(
                toAt: HealthSyncService.iso(end),
                timezone: timezone,
                pipeline: Self.pipeline
            )
            if let server = stamped.lastWorkoutSyncedAt.flatMap(HealthSyncService.parseISO) {
                Self.storeLastSyncedAt(server)
            } else {
                Self.storeLastSyncedAt(end)
            }
        }
        try await finish(
            source: source,
            workouts: export.workouts,
            routeCount: export.routes.count,
            upserted: upserted,
            syncedAt: end
        )
        onProgress(1, "训练同步完成")
    }

    private struct WorkoutUploadResult {
        var upserted: Int
        var truncated: Bool
    }

    private func upload(
        workouts: [HealthWorkoutPayload],
        routes: [HealthWorkoutRoutePayload],
        deletions: [HealthKitDeletedObject],
        deadline: Date? = nil,
        shouldStop: @Sendable () -> Bool = { false },
        onProgress: @escaping @Sendable (Double, String) -> Void
    ) async throws -> WorkoutUploadResult {
        func outOfTime() -> Bool {
            if shouldStop() { return true }
            if let deadline, !BackgroundWakeBudget.shouldStartSlice(deadline: deadline) { return true }
            return false
        }

        if outOfTime() {
            return WorkoutUploadResult(upserted: 0, truncated: true)
        }

        var upserted = 0
        let workoutDeletions = deletions.filter { $0.kind == "workout" }
        if !workoutDeletions.isEmpty {
            _ = try await api.syncDeletions(
                HealthDeletionSyncPayload(
                    timezone: timezone,
                    deletions: workoutDeletions.map {
                        HealthDeletionItemPayload(hkUuid: $0.hkUuid, kind: $0.kind)
                    }
                )
            )
            upserted += workoutDeletions.count
        }

        let total = max(workouts.count, 1)
        for (index, chunk) in workouts.chunked(into: Self.chunkSize).enumerated() {
            if outOfTime() {
                return WorkoutUploadResult(upserted: upserted, truncated: true)
            }
            onProgress(
                0.2 + 0.7 * Double(index) / Double(max(workouts.chunked(into: Self.chunkSize).count, 1)),
                "训练 · \(min((index + 1) * Self.chunkSize, workouts.count))/\(total)"
            )
            _ = try await api.syncWorkouts(HealthWorkoutSyncPayload(timezone: timezone, workouts: chunk))
            upserted += chunk.count
            let ids = Set(chunk.map { $0.hkUuid.lowercased() })
            let chunkRoutes = routes.filter { ids.contains($0.hkUuid.lowercased()) }
            if !chunkRoutes.isEmpty {
                _ = try await api.syncWorkoutRoutes(
                    HealthWorkoutRouteSyncPayload(timezone: timezone, routes: chunkRoutes)
                )
                upserted += chunkRoutes.count
            }
            if try await uploadWorkoutDetail(
                for: chunk,
                deadline: deadline,
                shouldStop: shouldStop
            ) {
                return WorkoutUploadResult(upserted: upserted, truncated: true)
            }
        }
        return WorkoutUploadResult(upserted: upserted, truncated: false)
    }

    /// Session stats are averages only. Curves are the expanded quantity series.
    /// Returns true when the shared wake budget ended before every curve was uploaded.
    private func uploadWorkoutDetail(
        for workouts: [HealthWorkoutPayload],
        deadline: Date?,
        shouldStop: @Sendable () -> Bool
    ) async throws -> Bool {
        func outOfTime() -> Bool {
            if shouldStop() { return true }
            if let deadline, !BackgroundWakeBudget.shouldStartSlice(deadline: deadline) { return true }
            return false
        }
        if outOfTime() { return true }

        var samples: [HealthQuantitySamplePayload] = []
        for workout in workouts {
            if outOfTime() { return true }
            guard let start = HealthSyncService.parseISO(workout.startAt),
                  let end = HealthSyncService.parseISO(workout.endAt),
                  start < end
            else { continue }
            let detail = await store.exportWorkoutDetailQuantities(from: start, to: end)
            samples.append(contentsOf: detail.samples)
        }
        var seen = Set<String>()
        let unique = samples.filter { seen.insert($0.hkUuid).inserted }
        for chunk in unique.chunked(into: 1000) where !chunk.isEmpty {
            if outOfTime() { return true }
            _ = try await api.syncSamples(HealthQuantitySyncPayload(timezone: timezone, samples: chunk))
        }
        return false
    }

    func persistCurrentAnchors() async throws {
        let anchors = try await store.captureCurrentWorkoutAnchors()
        await anchorStore.saveAll(anchors)
    }

    /// Empty syncs (no workouts/routes/upserts) are not persisted as history rows.
    private func finish(
        source: HealthSyncSource,
        workouts: [HealthWorkoutPayload],
        routeCount: Int,
        upserted: Int,
        syncedAt: Date
    ) async throws {
        guard !workouts.isEmpty || routeCount > 0 || upserted > 0 else { return }
        let range = Self.workoutTimeRange(workouts)
        _ = try await api.finishRun(
            HealthSyncRunIn(
                source: source.rawValue,
                status: "success",
                pipeline: Self.pipeline,
                fromAt: range.map { HealthSyncService.iso($0.start) },
                toAt: HealthSyncService.iso(range?.end ?? syncedAt),
                quantityCount: 0,
                sleepCount: 0,
                standHourCount: 0,
                heartbeatSeriesCount: 0,
                workoutCount: workouts.count,
                routeCount: routeCount,
                upserted: upserted,
                localDates: [],
                error: nil
            )
        )
    }

    static func workoutTimeRange(_ workouts: [HealthWorkoutPayload]) -> (start: Date, end: Date)? {
        var starts: [Date] = []
        var ends: [Date] = []
        for workout in workouts {
            if let start = HealthSyncService.parseISO(workout.startAt) { starts.append(start) }
            if let end = HealthSyncService.parseISO(workout.endAt) { ends.append(end) }
        }
        guard let start = starts.min(), let end = ends.max() else { return nil }
        return (start, end)
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
