import Foundation
import os

enum HealthSyncTelemetry {
    private static let log = Logger(subsystem: "Timia.HealthSync", category: "Sync")

    static func logExport(exportMs: Int) {
        log.info("export_ms=\(exportMs, privacy: .public)")
    }

    static func logDrain(
        uploadMs: Int,
        drainBatches: Int,
        batchBytes: Int,
        outboxPending: Int,
        bgBudgetHit: Bool
    ) {
        log.info(
            "upload_ms=\(uploadMs, privacy: .public) drain_batches=\(drainBatches, privacy: .public) batch_bytes=\(batchBytes, privacy: .public) outbox_pending=\(outboxPending, privacy: .public) bg_budget_hit=\(bgBudgetHit, privacy: .public)"
        )
    }
}

struct HealthSyncDrainBudget: Sendable {
    var maxBatches: Int
    var maxDuration: TimeInterval

    static let foreground = HealthSyncDrainBudget(maxBatches: .max, maxDuration: .infinity)
    static let background = HealthSyncDrainBudget(maxBatches: 8, maxDuration: 20)
}

enum HealthSyncDrainError: Error, LocalizedError, Sendable {
    case decodeFailed(category: HealthSyncOutboxCategory, underlying: String)
    case unsupportedCategory(HealthSyncOutboxCategory)
    case noProgress(remaining: Int)

    var errorDescription: String? {
        switch self {
        case .decodeFailed(let category, let underlying):
            return "Outbox decode failed for \(category.rawValue): \(underlying)"
        case .unsupportedCategory(let category):
            return "Outbox category not supported yet: \(category.rawValue)"
        case .noProgress(let remaining):
            return "Outbox drain made no progress with \(remaining) row(s) remaining"
        }
    }
}

/// Shared upload scheduler for manual (aggressive) and background (budgeted) drains.
@MainActor
struct HealthSyncDrain {
    var api: HealthSyncAPI
    var queue: HealthSyncQueue = .shared
    /// Overall in-flight upload cap (same-category or cross-category Group A).
    var uploadConcurrency: Int = HealthSyncService.uploadConcurrency

    /// Categories safe to upload concurrently with each other.
    private static let parallelGroupA: Set<HealthSyncOutboxCategory> = [
        .samples, .sleep, .standHours, .heartbeats,
    ]

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    static func encodePayload<T: Encodable>(_ payload: T) throws -> Data {
        try encoder.encode(payload)
    }

    /// Returns number of batches uploaded. Stops when budget hit or queue empty.
    func drain(
        budget: HealthSyncDrainBudget,
        onProgress: ((String) -> Void)? = nil
    ) async throws -> Int {
        try await queue.resetUploadingToPending()

        let started = Date()
        let uploadStarted = Date()
        var uploaded = 0
        var totalBatchBytes = 0
        var durationBudgetHit = false

        do {
            while uploaded < budget.maxBatches {
                if Date().timeIntervalSince(started) >= budget.maxDuration {
                    durationBudgetHit = true
                    break
                }

                let room = min(uploadConcurrency, budget.maxBatches - uploaded)
                let batch = try await nextUploadWave(limit: room)
                if batch.isEmpty {
                    break
                }

                totalBatchBytes += batch.reduce(0) { $0 + $1.payload.count }

                let ids = batch.map(\.id)
                try await queue.markUploading(ids: ids)

                let label = Self.waveLabel(batch)
                onProgress?("上传 \(label) \(uploaded + 1)")

                // Cap overall concurrency (within-category or Group A cross-category).
                try await withThrowingTaskGroup(of: Void.self) { group in
                    var inflight = 0
                    for row in batch {
                        group.addTask { [api, queue] in
                            try await Self.uploadRow(row, api: api, queue: queue)
                        }
                        inflight += 1
                        if inflight >= uploadConcurrency {
                            _ = try await group.next()
                            inflight -= 1
                            uploaded += 1
                            onProgress?("上传 \(label) \(uploaded)")
                        }
                    }
                    while inflight > 0 {
                        _ = try await group.next()
                        inflight -= 1
                        uploaded += 1
                        onProgress?("上传 \(label) \(uploaded)")
                    }
                }

                if Date().timeIntervalSince(started) >= budget.maxDuration {
                    durationBudgetHit = true
                    break
                }
            }

            try await queue.resetUploadingToPending()
            let outboxPending = try await queue.pendingCount()
            let uploadMs = Int(Date().timeIntervalSince(uploadStarted) * 1000)
            let batchBudgetHit = uploaded >= budget.maxBatches && outboxPending > 0
            let bgBudgetHit = budget != .foreground
                && outboxPending > 0
                && (durationBudgetHit || batchBudgetHit)
            HealthSyncTelemetry.logDrain(
                uploadMs: uploadMs,
                drainBatches: uploaded,
                batchBytes: totalBatchBytes,
                outboxPending: outboxPending,
                bgBudgetHit: bgBudgetHit
            )
            return uploaded
        } catch {
            try? await queue.resetUploadingToPending()
            throw error
        }
    }

    // MARK: - Wave selection
    // Deletions first → Group A (samples ∥ sleep ∥ standHours ∥ heartbeats)
    // → workouts → routes (blocked while same/earlier-day workouts pending).

    private func nextUploadWave(limit: Int) async throws -> [HealthSyncOutboxRow] {
        let pending = try await queue.nextPending(limit: max(limit * 16, 64))
        guard !pending.isEmpty else { return [] }

        // Prefer deletions so soft-deletes land before upserts that could clear deleted_at.
        let deletionRows = pending.filter { $0.category == .deletions }
        if !deletionRows.isEmpty {
            return Array(deletionRows.prefix(limit))
        }

        // Group A: mix safe categories in one wave up to the concurrency cap.
        var groupA: [HealthSyncOutboxRow] = []
        groupA.reserveCapacity(limit)
        for row in pending where Self.parallelGroupA.contains(row.category) {
            groupA.append(row)
            if groupA.count >= limit { break }
        }
        if !groupA.isEmpty {
            return groupA
        }

        // Workouts before routes (routes may depend on workout upserts for the same day).
        let workoutRows = pending.filter { $0.category == .workouts }
        if !workoutRows.isEmpty {
            return Array(workoutRows.prefix(limit))
        }

        var routeRows: [HealthSyncOutboxRow] = []
        routeRows.reserveCapacity(limit)
        for row in pending where row.category == .routes {
            let blocked = try await queue.hasBlockingWorkouts(
                forRouteId: row.id,
                localDate: row.localDate
            )
            if blocked { continue }
            routeRows.append(row)
            if routeRows.count >= limit { break }
        }
        return routeRows
    }

    // MARK: - Upload one outbox row

    nonisolated private static func uploadRow(
        _ row: HealthSyncOutboxRow,
        api: HealthSyncAPI,
        queue: HealthSyncQueue
    ) async throws {
        do {
            _ = try await post(row, api: api)
            try await queue.acknowledge(ids: [row.id])
        } catch let error as APIError {
            let nextAttempts = row.attempts + 1
            switch error {
            case .unauthorized:
                try await queue.requeue(id: row.id, attempts: nextAttempts)
                throw error
            case .transport:
                try await queue.requeue(id: row.id, attempts: nextAttempts)
                throw error
            case .server(let status, _) where status >= 500:
                try await queue.requeue(id: row.id, attempts: nextAttempts)
                throw error
            case .server:
                try await queue.markFailed(id: row.id, attempts: nextAttempts)
                throw error
            case .invalidConfiguration, .invalidResponse:
                try await queue.requeue(id: row.id, attempts: nextAttempts)
                throw error
            }
        } catch {
            try await queue.requeue(id: row.id, attempts: row.attempts + 1)
            throw error
        }
    }

    nonisolated private static func post(_ row: HealthSyncOutboxRow, api: HealthSyncAPI) async throws -> HealthSyncOut {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            switch row.category {
            case .samples:
                let payload = try decoder.decode(HealthQuantitySyncPayload.self, from: row.payload)
                return try await api.syncSamples(payload)
            case .sleep:
                let payload = try decoder.decode(HealthSleepSyncPayload.self, from: row.payload)
                return try await api.syncSleep(payload)
            case .standHours:
                let payload = try decoder.decode(HealthStandHourSyncPayload.self, from: row.payload)
                return try await api.syncStandHours(payload)
            case .workouts:
                let payload = try decoder.decode(HealthWorkoutSyncPayload.self, from: row.payload)
                return try await api.syncWorkouts(payload)
            case .routes:
                let payload = try decoder.decode(HealthWorkoutRouteSyncPayload.self, from: row.payload)
                return try await api.syncWorkoutRoutes(payload)
            case .heartbeats:
                let payload = try decoder.decode(HealthHeartbeatSyncPayload.self, from: row.payload)
                return try await api.syncHeartbeat(payload)
            case .deletions:
                let payload = try decoder.decode(HealthDeletionSyncPayload.self, from: row.payload)
                return try await api.syncDeletions(payload)
            }
        } catch let error as HealthSyncDrainError {
            throw error
        } catch let error as APIError {
            throw error
        } catch {
            throw HealthSyncDrainError.decodeFailed(
                category: row.category,
                underlying: error.localizedDescription
            )
        }
    }

    private static func waveLabel(_ rows: [HealthSyncOutboxRow]) -> String {
        let categories = Set(rows.map(\.category))
        if categories.count == 1, let only = categories.first {
            return categoryLabel(only)
        }
        return "并行"
    }

    private static func categoryLabel(_ category: HealthSyncOutboxCategory) -> String {
        switch category {
        case .samples: return "指标"
        case .sleep: return "睡眠"
        case .standHours: return "站立"
        case .workouts: return "训练"
        case .routes: return "路线"
        case .heartbeats: return "心跳"
        case .deletions: return "删除"
        }
    }
}
