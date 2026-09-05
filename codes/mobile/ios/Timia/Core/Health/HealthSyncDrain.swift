import Foundation

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
    var uploadConcurrency: Int = HealthSyncService.uploadConcurrency

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
        var uploaded = 0

        do {
            while uploaded < budget.maxBatches {
                if Date().timeIntervalSince(started) >= budget.maxDuration {
                    break
                }

                let room = min(uploadConcurrency, budget.maxBatches - uploaded)
                let batch = try await nextSameCategoryBatch(limit: room)
                if batch.isEmpty {
                    break
                }

                let ids = batch.map(\.id)
                try await queue.markUploading(ids: ids)

                let category = batch[0].category
                let label = Self.categoryLabel(category)
                onProgress?("上传 \(label) \(uploaded + 1)")

                // Same-category concurrency (cap = uploadConcurrency), matching prior uploadBatches.
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
                    break
                }
            }

            try await queue.resetUploadingToPending()
            return uploaded
        } catch {
            try? await queue.resetUploadingToPending()
            throw error
        }
    }

    // MARK: - Batch selection (deletions first; workouts before routes)

    private func nextSameCategoryBatch(limit: Int) async throws -> [HealthSyncOutboxRow] {
        let pending = try await queue.nextPending(limit: max(limit * 16, 64))
        guard !pending.isEmpty else { return [] }

        // Prefer deletions so soft-deletes land before upserts that could clear deleted_at.
        let deletionRows = pending.filter { $0.category == .deletions }
        if !deletionRows.isEmpty {
            return Array(deletionRows.prefix(limit))
        }

        for row in pending {
            if row.category == .routes {
                let blocked = try await queue.hasBlockingWorkouts(
                    forRouteId: row.id,
                    localDate: row.localDate
                )
                if blocked { continue }
            }
            let category = row.category
            return Array(pending.filter { $0.category == category }.prefix(limit))
        }
        return []
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
