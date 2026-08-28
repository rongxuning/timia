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

@MainActor
struct HealthSyncService {
    var api: HealthSyncAPI
    var store = HealthKitStore()
    var timezone: String = TimeZone.current.identifier

    func readLastNinetyDays() async throws -> HealthKitExport {
        let start = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
        return try await store.exportSamples(from: start)
    }

    func syncLastNinetyDays(onProgress: @escaping (Double, String) -> Void) async throws {
        onProgress(0.05, "正在读取健康数据…")
        let export = try await readLastNinetyDays()
        try await upload(export, onProgress: onProgress)
    }

    func upload(
        _ export: HealthKitExport,
        onProgress: @escaping (Double, String) -> Void
    ) async throws {
        let sampleBatches = export.samples.chunked(into: 500)
        let sleepBatches = export.sleep.chunked(into: 200)
        let standBatches = export.standHours.chunked(into: 200)
        let workoutBatches = export.workouts.chunked(into: 50)
        let heartbeatBatches = export.heartbeats.chunked(into: 20)
        let total = max(
            sampleBatches.count + sleepBatches.count + standBatches.count
                + workoutBatches.count + heartbeatBatches.count,
            1
        )
        var done = 0

        func step(_ label: String) {
            done += 1
            onProgress(Double(done) / Double(total), label)
        }

        if sampleBatches.isEmpty, sleepBatches.isEmpty, standBatches.isEmpty,
           workoutBatches.isEmpty, heartbeatBatches.isEmpty {
            onProgress(1, "没有需要上传的数据")
            return
        }

        for batch in sampleBatches {
            _ = try await api.syncSamples(HealthQuantitySyncPayload(timezone: timezone, samples: batch))
            step("正在同步指标 \(done)/\(total)")
        }
        for batch in sleepBatches {
            _ = try await api.syncSleep(HealthSleepSyncPayload(timezone: timezone, samples: batch))
            step("正在同步睡眠 \(done)/\(total)")
        }
        for batch in standBatches {
            _ = try await api.syncStandHours(HealthStandHourSyncPayload(timezone: timezone, samples: batch))
            step("正在同步站立 \(done)/\(total)")
        }
        for batch in workoutBatches {
            _ = try await api.syncWorkouts(HealthWorkoutSyncPayload(timezone: timezone, workouts: batch))
            step("正在同步训练 \(done)/\(total)")
        }
        for batch in heartbeatBatches {
            _ = try await api.syncHeartbeat(HealthHeartbeatSyncPayload(timezone: timezone, series: batch))
            step("正在同步心跳序列 \(done)/\(total)")
        }
        onProgress(1, "同步完成")
    }

    static func pendingDays(from export: HealthKitExport) -> [HealthPendingDay] {
        var buckets: [String: HealthPendingDay] = [:]

        func day(of iso: String) -> String {
            localDay(of: iso)
        }

        func bucket(_ iso: String) -> HealthPendingDay {
            let key = day(of: iso)
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

    private static func localDay(of iso: String) -> String {
        let date = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
            ?? (try? Date(iso, strategy: .iso8601))
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
