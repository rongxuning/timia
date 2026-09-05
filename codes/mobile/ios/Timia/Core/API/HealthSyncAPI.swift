import Foundation

struct HealthSyncOut: Decodable, Sendable {
    var upserted: Int
    var localDates: [String]
}

struct HealthSyncDayStatus: Decodable, Sendable, Identifiable {
    var localDate: String
    var quantityCount: Int
    var sleepCount: Int
    var standHourCount: Int
    var heartbeatSeriesCount: Int
    var workoutCount: Int

    var id: String { localDate }
    var totalCount: Int {
        quantityCount + sleepCount + standHourCount + heartbeatSeriesCount + workoutCount
    }
}

struct HealthSyncRun: Decodable, Sendable, Identifiable {
    var id: String
    var source: String
    var status: String
    var startedAt: String
    var finishedAt: String?
    var fromAt: String?
    var toAt: String?
    var quantityCount: Int
    var sleepCount: Int
    var standHourCount: Int
    var heartbeatSeriesCount: Int
    var workoutCount: Int
    var routeCount: Int
    var upserted: Int
    var localDates: [String]
    var error: String?

    var summary: String {
        var parts: [String] = []
        if quantityCount > 0 { parts.append("指标 \(quantityCount)") }
        if sleepCount > 0 { parts.append("睡眠 \(sleepCount)") }
        if standHourCount > 0 { parts.append("站立 \(standHourCount)") }
        if heartbeatSeriesCount > 0 { parts.append("心跳序列 \(heartbeatSeriesCount)") }
        if workoutCount > 0 { parts.append("训练 \(workoutCount)") }
        if routeCount > 0 { parts.append("路线 \(routeCount)") }
        if parts.isEmpty { return upserted > 0 ? "写入 \(upserted) 条" : "无新样本" }
        return parts.joined(separator: " · ")
    }

    var sourceLabel: String {
        source == "background" ? "后台" : "手动"
    }
}

struct HealthSyncRunIn: Encodable, Sendable {
    var source: String
    var status: String
    var fromAt: String?
    var toAt: String
    var quantityCount: Int
    var sleepCount: Int
    var standHourCount: Int
    var heartbeatSeriesCount: Int
    var workoutCount: Int
    var routeCount: Int
    var upserted: Int
    var localDates: [String]
    var error: String?
}

struct HealthSyncStatus: Decodable, Sendable {
    var timezone: String
    var lastSyncedAt: String?
    var days: [HealthSyncDayStatus]
    var runs: [HealthSyncRun]?
}

struct HealthSyncCheckpointIn: Encodable, Sendable {
    var toAt: String
    var timezone: String
}

struct HealthSyncCheckpointOut: Decodable, Sendable {
    var lastSyncedAt: String
}

struct HealthQuantitySamplePayload: Codable, Sendable {
    var hkUuid: String
    var metricType: String
    var startAt: String
    var endAt: String
    var value: Double
    var unit: String
    var sourceBundleId: String?
    var sourceName: String?
}

struct HealthQuantitySyncPayload: Codable, Sendable {
    var timezone: String
    var samples: [HealthQuantitySamplePayload]
}

struct HealthSleepSamplePayload: Codable, Sendable {
    var hkUuid: String
    var startAt: String
    var endAt: String
    var stage: String
    var timezone: String
    var sourceBundleId: String?
    var sourceName: String?
}

struct HealthSleepSyncPayload: Codable, Sendable {
    var timezone: String
    var samples: [HealthSleepSamplePayload]
}

struct HealthStandHourPayload: Codable, Sendable {
    var hkUuid: String
    var startAt: String
    var endAt: String
    var stood: Bool
    var sourceBundleId: String?
    var sourceName: String?
}

struct HealthStandHourSyncPayload: Codable, Sendable {
    var timezone: String
    var samples: [HealthStandHourPayload]
}

struct HealthWorkoutPayload: Codable, Sendable {
    var hkUuid: String
    var activityType: String
    var activityTypeRaw: String?
    var startAt: String
    var endAt: String
    var durationSeconds: Int
    var activeEnergyKcal: Double?
    var distanceM: Double?
    var avgHrBpm: Double?
    var maxHrBpm: Double?
    var avgCadenceSpm: Double?
    var avgPaceSecPerKm: Double?
    var elevationAscendedM: Double?
    var elevationDescendedM: Double?
    var weatherTempC: Double?
    var weatherHumidity: Double?
    var locationCountry: String?
    var locationAdmin: String?
    var locationCity: String?
    var sourceBundleId: String?
    var sourceName: String?
}

struct HealthWorkoutSyncPayload: Codable, Sendable {
    var timezone: String
    var workouts: [HealthWorkoutPayload]
}

struct HealthWorkoutRoutePoint: Codable, Sendable {
    var t: Double
    var lat: Double
    var lng: Double
    var alt: Double?
}

struct HealthWorkoutRoutePayload: Codable, Sendable {
    var hkUuid: String
    var points: [HealthWorkoutRoutePoint]
}

struct HealthWorkoutRouteSyncPayload: Codable, Sendable {
    var timezone: String
    var routes: [HealthWorkoutRoutePayload]
}

struct HealthHeartbeatIntervalPayload: Codable, Sendable {
    var t: Double
    var gap: Bool
}

struct HealthHeartbeatSeriesPayload: Codable, Sendable {
    var hkUuid: String
    var startAt: String
    var endAt: String
    var intervals: [HealthHeartbeatIntervalPayload]
    var sourceBundleId: String?
    var sourceName: String?
}

struct HealthHeartbeatSyncPayload: Codable, Sendable {
    var timezone: String
    var series: [HealthHeartbeatSeriesPayload]
}

struct HealthDeletionItemPayload: Codable, Sendable {
    /// HealthKit object UUID (lowercase).
    var hkUuid: String
    /// Server `DELETION_KINDS`: quantity | sleep | stand_hour | heartbeat_series | workout
    var kind: String
}

struct HealthDeletionSyncPayload: Codable, Sendable {
    var timezone: String
    var deletions: [HealthDeletionItemPayload]
}

struct HealthSyncAPI: Sendable {
    let client: APIClient

    func syncStatus(timezone: String, from: String? = nil, to: String? = nil) async throws -> HealthSyncStatus {
        var query: [URLQueryItem] = [URLQueryItem(name: "timezone", value: timezone)]
        if let from { query.append(URLQueryItem(name: "from", value: from)) }
        if let to { query.append(URLQueryItem(name: "to", value: to)) }
        return try await client.request(
            "/health/sync-status",
            query: query,
            response: HealthSyncStatus.self
        )
    }

    func finishRun(_ payload: HealthSyncRunIn) async throws -> HealthSyncRun {
        try await client.request("/health/sync/runs", method: "POST", body: payload, response: HealthSyncRun.self)
    }

    func checkpoint(toAt: String, timezone: String = TimeZone.current.identifier) async throws -> HealthSyncCheckpointOut {
        try await client.request(
            "/health/sync/checkpoint",
            method: "POST",
            body: HealthSyncCheckpointIn(toAt: toAt, timezone: timezone),
            response: HealthSyncCheckpointOut.self
        )
    }

    func syncSamples(_ payload: HealthQuantitySyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/samples",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }

    func syncSleep(_ payload: HealthSleepSyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/sleep",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }

    func syncStandHours(_ payload: HealthStandHourSyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/stand-hours",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }

    func syncWorkouts(_ payload: HealthWorkoutSyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/workouts",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }

    func syncWorkoutRoutes(_ payload: HealthWorkoutRouteSyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/workout-routes",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }

    func syncHeartbeat(_ payload: HealthHeartbeatSyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/heartbeat-series",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }

    func syncDeletions(_ payload: HealthDeletionSyncPayload) async throws -> HealthSyncOut {
        try await client.request(
            "/health/sync/deletions",
            method: "POST",
            body: payload,
            compress: true,
            timeoutInterval: 60,
            response: HealthSyncOut.self
        )
    }
}
