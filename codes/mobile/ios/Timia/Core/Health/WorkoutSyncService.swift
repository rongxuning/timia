import Foundation
import os

struct WorkoutPendingItem: Identifiable, Sendable {
    var workout: HealthWorkoutPayload
    var id: String { workout.hkUuid }
}

@MainActor
struct WorkoutSyncService {
    static let lastSyncedKey = "timia.workout.lastSyncedAt"
    static let pipeline = "workout"
    static let firstLookbackDays = 90
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
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        if watermark == nil || onlyHkUuid != nil || !(await Self.anchorsHealthy()) {
            try await syncWindow(
                source: source,
                onlyHkUuid: onlyHkUuid,
                skipGlobalCheckpoint: skipGlobalCheckpoint || onlyHkUuid != nil,
                onProgress: onProgress
            )
            if watermark == nil {
                try await persistCurrentAnchors()
            }
            return
        }

        do {
            try await syncAnchored(source: source, onProgress: onProgress)
        } catch HealthKitStoreError.needsAnchorHeal {
            try await syncWindow(
                source: source,
                skipGlobalCheckpoint: skipGlobalCheckpoint,
                onProgress: onProgress
            )
            try await persistCurrentAnchors()
        }
    }

    func syncBackgroundBudgeted() async throws {
        guard Self.cachedLastSyncedAt() != nil else { return }
        if await Self.anchorsHealthy() {
            try await syncAnchored(source: .background) { _, _ in }
        } else {
            try await syncWindow(source: .background, onProgress: { _, _ in })
            try await persistCurrentAnchors()
        }
    }

    private func syncAnchored(
        source: HealthSyncSource,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        onProgress(0.1, "读取训练增量")
        let (export, newAnchors) = try await store.exportWorkoutAnchoredChanges()
        onProgress(0.3, "上传训练")
        let upserted = try await upload(
            workouts: export.workouts,
            routes: export.routes,
            deletions: export.deletions,
            onProgress: onProgress
        )
        await anchorStore.saveAll(newAnchors)
        let stamped = try await api.checkpoint(
            toAt: HealthSyncService.iso(Date()),
            timezone: timezone,
            pipeline: Self.pipeline
        )
        if let server = stamped.lastWorkoutSyncedAt.flatMap(HealthSyncService.parseISO) {
            Self.storeLastSyncedAt(server)
        } else {
            Self.storeLastSyncedAt(Date())
        }
        try await finish(
            source: source,
            start: Date(),
            end: Date(),
            workoutCount: export.workouts.count,
            routeCount: export.routes.count,
            upserted: upserted
        )
        onProgress(1, "训练同步完成")
    }

    private func syncWindow(
        source: HealthSyncSource,
        onlyHkUuid: String? = nil,
        skipGlobalCheckpoint: Bool = false,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -Self.firstLookbackDays, to: end) ?? end
        onProgress(0.05, "读取近 \(Self.firstLookbackDays) 天训练")
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

        let upserted = try await upload(
            workouts: export.workouts,
            routes: export.routes,
            deletions: [],
            onProgress: onProgress
        )
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
            start: start,
            end: end,
            workoutCount: export.workouts.count,
            routeCount: export.routes.count,
            upserted: upserted
        )
        onProgress(1, "训练同步完成")
    }

    private func upload(
        workouts: [HealthWorkoutPayload],
        routes: [HealthWorkoutRoutePayload],
        deletions: [HealthKitDeletedObject],
        onProgress: @escaping (Double, String) -> Void
    ) async throws -> Int {
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
        }
        return upserted
    }

    func persistCurrentAnchors() async throws {
        let anchors = try await store.captureCurrentWorkoutAnchors()
        await anchorStore.saveAll(anchors)
    }

    private func finish(
        source: HealthSyncSource,
        start: Date,
        end: Date,
        workoutCount: Int,
        routeCount: Int,
        upserted: Int
    ) async throws {
        _ = try await api.finishRun(
            HealthSyncRunIn(
                source: source.rawValue,
                status: "success",
                pipeline: Self.pipeline,
                fromAt: HealthSyncService.iso(start),
                toAt: HealthSyncService.iso(end),
                quantityCount: 0,
                sleepCount: 0,
                standHourCount: 0,
                heartbeatSeriesCount: 0,
                workoutCount: workoutCount,
                routeCount: routeCount,
                upserted: upserted,
                localDates: [],
                error: nil
            )
        )
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
