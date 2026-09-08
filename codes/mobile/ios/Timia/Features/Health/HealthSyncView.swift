import HealthKit
import SwiftUI
import UIKit

enum HealthSyncFailure: Equatable {
    case unauthorized
    case offline
    case server(status: Int, message: String)
    case timeout
    case permission
    case outboxStuck(remaining: Int)
    case other(message: String)

    var alertTitle: String { "同步失败" }

    var userMessage: String {
        switch self {
        case .unauthorized:
            return "登录已过期，请重新登录后再试。"
        case .offline:
            return "网络好像断了，恢复后点「重试」继续。"
        case let .server(status, message):
            return "服务端返回 \(status)：\(message)。稍后重试。"
        case .timeout:
            return "请求超时，下次同步会从断点继续。"
        case .permission:
            return "健康数据权限被收回。请到「设置 → 健康 → Timia」重新授权。"
        case let .outboxStuck(remaining):
            return "本地还有 \(remaining) 条待上传，这一轮发不出去。请点「清空本地队列」后重新同步。"
        case let .other(message):
            return message
        }
    }
}

struct HealthSyncView: View {
    @EnvironmentObject private var session: AppSession
    @StateObject private var permissions = HealthPermissionManager.shared
    @State private var syncedRuns: [HealthSyncRun] = []
    @State private var syncedDays: [HealthSyncDayStatus] = []
    @State private var pendingDays: [HealthPendingDay] = []
    @State private var isSyncing = false
    @State private var progressText = ""
    @State private var progress: Double = 0
    @State private var syncError: HealthSyncFailure?
    @State private var lastErrorSummary: String?
    @State private var quantityGapHint: String?
    @State private var lastSyncedAt: Date?
    @State private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    @State private var outboxPendingCount = 0
    @State private var outboxFailedCount = 0
    @State private var confirmClearOutbox = false

    private static let lastErrorSummaryKey = "timia.health.lastErrorSummary"

    var body: some View {
        List {
            Section {
                if !permissions.isHealthDataAvailable {
                    Text("此设备不支持健康数据（模拟器能力不完整，请用真机）。")
                        .foregroundStyle(.secondary)
                } else if !permissions.didRequest {
                    Button("授权健康数据") {
                        Task { await authorize() }
                    }
                } else {
                    HStack {
                        Button(isSyncing ? "同步中…" : "同步") {
                            Task { await sync() }
                        }
                        .disabled(isSyncing)
                        if let lastErrorSummary, !isSyncing {
                            Spacer()
                            Button {
                                Task { await sync() }
                            } label: {
                                Label("重试", systemImage: "arrow.clockwise")
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    if let lastSyncedAt {
                        LabeledContent("上次同步", value: lastSyncedAt.formatted(date: .abbreviated, time: .shortened))
                    }
                    if let lastErrorSummary, !isSyncing {
                        Text("上次失败：\(lastErrorSummary)")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                    Text("水位与同步记录保存在服务端；本机按天上传原始数据。首次约 90 天，中断后从服务端断点继续。新数据也会在写入「健康」后后台上传。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if outboxPendingCount + outboxFailedCount > 0 {
                        LabeledContent("本地队列", value: queueSummary)
                        Button("清空本地队列", role: .destructive) {
                            confirmClearOutbox = true
                        }
                        .disabled(isSyncing)
                    }
                }
                if let hint = permissions.lastError {
                    Text(hint).foregroundStyle(.red)
                }
                if let quantityGapHint {
                    Text(quantityGapHint)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
                if permissions.didRequest {
                    Button("在系统设置中管理权限") {
                        permissions.openSettings()
                    }
                }
            }

            Section("待同步") {
                if pendingDays.isEmpty {
                    Text(
                        permissions.didRequest
                            ? (lastSyncedAt == nil
                                ? "授权后点同步会按天读取近 90 天数据；中断后可续传。"
                                : (isSyncing ? "正在按天同步…" : "当前没有待同步的数据。"))
                            : "授权后即可读取本机健康数据。"
                    )
                    .foregroundStyle(.secondary)
                } else {
                    ForEach(pendingDays) { day in
                        VStack(alignment: .leading, spacing: 6) {
                            LabeledContent(day.localDate, value: day.summary)
                            ForEach(day.workouts, id: \.hkUuid) { workout in
                                Text(workout.activityTitle)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("已同步") {
                if !syncedRuns.isEmpty {
                    ForEach(syncedRuns) { run in
                        VStack(alignment: .leading, spacing: 4) {
                            LabeledContent(runTime(run), value: run.sourceLabel)
                            Text(run.summary)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else if !syncedDays.isEmpty {
                    ForEach(syncedDays) { day in
                        LabeledContent(day.localDate, value: "\(day.totalCount) 条")
                    }
                } else {
                    Text("还没有同步记录")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("健康数据")
        .task {
            lastSyncedAt = HealthSyncService.cachedLastSyncedAt()
            lastErrorSummary = UserDefaults.standard.string(forKey: Self.lastErrorSummaryKey)
            await refreshStatus()
            await loadPendingDays()
            await refreshOutboxCounts()
        }
        .refreshable {
            await refreshStatus()
            await loadPendingDays()
            await refreshOutboxCounts()
        }
        .overlay {
            if isSyncing {
                ZStack {
                    Color.black.opacity(0.45).ignoresSafeArea()
                    VStack(spacing: 16) {
                        ProgressView(value: progress)
                            .progressViewStyle(.linear)
                        Text(progressText.isEmpty ? "正在同步…" : progressText)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                    }
                    .padding(24)
                    .frame(maxWidth: 320)
                    .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                    .allowsHitTesting(true)
                }
                .allowsHitTesting(true)
            }
        }
        .alert(syncError?.alertTitle ?? "同步失败", isPresented: Binding(
            get: { syncError != nil },
            set: { if !$0 { syncError = nil } }
        )) {
            Button("好", role: .cancel) { syncError = nil }
        } message: {
            Text(syncError?.userMessage ?? "")
        }
        .confirmationDialog("清空本地队列？", isPresented: $confirmClearOutbox, titleVisibility: .visible) {
            Button("清空", role: .destructive) {
                Task { await clearOutbox() }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("只删除本机还没发出去的批次，服务端已同步的数据不受影响。清空后请再点同步。")
        }
    }

    private func authorize() async {
        _ = await permissions.requestIfNeeded()
        await HealthBackgroundDelivery.shared.start(api: session.api)
        await loadPendingDays()
    }

    private func refreshStatus() async {
        do {
            let status = try await HealthSyncAPI(client: session.api)
                .syncStatus(timezone: TimeZone.current.identifier)
            syncedRuns = (status.runs ?? []).filter { run in
                run.source == "manual" || run.upserted > 0 || run.quantityCount + run.sleepCount
                    + run.standHourCount + run.heartbeatSeriesCount + run.workoutCount + run.routeCount > 0
            }
            syncedDays = status.days.filter { $0.totalCount > 0 }
            let server = status.lastSyncedAt.flatMap(HealthSyncService.parseISO)
            lastSyncedAt = await HealthSyncService.applyServerWatermark(server)
        } catch {
            // Status fetch is best-effort: don't surface failures here so the
            // user can still retry sync from the existing checkpoint.
        }
    }

    private func loadPendingDays() async {
        guard HKHealthStore.isHealthDataAvailable(), permissions.didRequest else {
            return
        }
        guard lastSyncedAt != nil else { return }
        do {
            let export: HealthKitExport
            if await HealthSyncService.anchorsHealthy() {
                // Preview only — do not persist returned anchors or drop keys on transient errors.
                let (delta, _) = try await HealthKitStore().exportAnchoredChanges(dropFailedKeys: false)
                export = delta
            } else {
                let start = Calendar.current.date(
                    byAdding: .day,
                    value: -HealthSyncService.backgroundLookbackDays,
                    to: Date()
                ) ?? Date()
                export = try await HealthKitStore().exportSamples(from: start, to: Date())
            }
            pendingDays = HealthSyncService.pendingDays(from: export)
        } catch {
            // Leave previous pendingDays in place; don't spam the user.
        }
    }

    private func sync() async {
        guard await permissions.requestIfNeeded() else { return }
        isSyncing = true
        progress = 0.02
        progressText = "正在同步…"
        syncError = nil
        beginSyncBackgroundTask()
        defer { endSyncBackgroundTask() }
        do {
            // Pull authoritative watermark before choosing the window.
            await refreshStatus()
            let watermark = lastSyncedAt
            quantityGapHint = nil
            if watermark == nil {
                let start = HealthSyncService.startDate(lastSyncedAt: nil)
                let days = HealthSyncService.daySlices(from: start, to: Date()).count
                progressText = "首次同步近 \(HealthSyncService.firstLookbackDays) 天（约 \(days) 片）…"
            } else if await HealthSyncService.anchorsHealthy() {
                progressText = "增量同步…"
            } else {
                progressText = "锚点修复 · 近 \(HealthSyncService.backgroundLookbackDays) 天…"
            }
            let service = HealthSyncService(api: HealthSyncAPI(client: session.api))
            try await service.syncFromWatermark(watermark, source: .manual) { fraction, label in
                progress = max(0.02, fraction)
                progressText = label
            }
            progress = 1
            progressText = "同步完成"
            try? await Task.sleep(for: .milliseconds(350))
            isSyncing = false
            clearLastError()
            pendingDays = []
            await refreshStatus()
            await HealthBackgroundDelivery.shared.start(api: session.api)
            await ScreenNotificationManager.shared.refresh(api: session.api)
            await loadPendingDays()
            await refreshOutboxCounts()
        } catch {
            isSyncing = false
            // Day checkpoints are on the server; refresh to show resume point.
            let failure = mapFailure(error)
            syncError = failure
            let summary = summarize(failure)
            lastErrorSummary = summary
            UserDefaults.standard.set(summary, forKey: Self.lastErrorSummaryKey)
            await refreshStatus()
            await loadPendingDays()
            await refreshOutboxCounts()
        }
    }

    private func mapFailure(_ error: Error) -> HealthSyncFailure {
        if let api = error as? APIError {
            switch api {
            case .unauthorized:
                return .unauthorized
            case .invalidConfiguration:
                return .other(message: "API 地址配置无效")
            case .invalidResponse:
                return .other(message: "服务器返回了无法识别的数据。")
            case .transport(let message):
                let lower = message.lowercased()
                if lower.contains("timeout") || lower.contains("timed out") {
                    return .timeout
                }
                if lower.contains("offline") || lower.contains("not connected")
                    || lower.contains("network") || lower.contains("internet") {
                    return .offline
                }
                return .other(message: "网络异常：\(message)")
            case let .server(status, message):
                if status == 401 { return .unauthorized }
                return .server(status: status, message: message)
            }
        }
        if let drain = error as? HealthSyncDrainError {
            switch drain {
            case .noProgress(let remaining):
                return .outboxStuck(remaining: remaining)
            case .decodeFailed, .unsupportedCategory:
                return .other(message: drain.localizedDescription)
            }
        }
        let nsError = error as NSError
        if nsError.domain == "NSHealthShareDeniedErrorDomain" || nsError.code == 5 {
            return .permission
        }
        return .other(message: error.localizedDescription)
    }

    private func summarize(_ failure: HealthSyncFailure) -> String {
        switch failure {
        case .unauthorized: return "登录已过期"
        case .offline: return "网络断开"
        case .timeout: return "请求超时"
        case .permission: return "健康权限被收回"
        case .outboxStuck: return "本地队列卡住"
        case let .server(status, _): return "服务端错误 \(status)"
        case let .other(message):
            return message.count > 30 ? String(message.prefix(30)) + "…" : message
        }
    }

    private func clearLastError() {
        lastErrorSummary = nil
        UserDefaults.standard.removeObject(forKey: Self.lastErrorSummaryKey)
    }

    private var queueSummary: String {
        var parts: [String] = []
        if outboxPendingCount > 0 { parts.append("待发 \(outboxPendingCount)") }
        if outboxFailedCount > 0 { parts.append("失败 \(outboxFailedCount)") }
        return parts.isEmpty ? "空" : parts.joined(separator: " · ")
    }

    private func refreshOutboxCounts() async {
        outboxPendingCount = (try? await HealthSyncQueue.shared.pendingCount()) ?? 0
        outboxFailedCount = (try? await HealthSyncQueue.shared.failedCount()) ?? 0
    }

    private func clearOutbox() async {
        try? await HealthSyncQueue.shared.clearAll()
        clearLastError()
        syncError = nil
        await refreshOutboxCounts()
        await loadPendingDays()
    }

    private func beginSyncBackgroundTask() {
        endSyncBackgroundTask()
        var taskID = UIBackgroundTaskIdentifier.invalid
        taskID = UIApplication.shared.beginBackgroundTask(withName: "health-sync") {
            if taskID != .invalid {
                UIApplication.shared.endBackgroundTask(taskID)
                taskID = .invalid
            }
        }
        backgroundTaskID = taskID
    }

    private func endSyncBackgroundTask() {
        let taskID = backgroundTaskID
        guard taskID != .invalid else { return }
        backgroundTaskID = .invalid
        UIApplication.shared.endBackgroundTask(taskID)
    }

    private func runTime(_ run: HealthSyncRun) -> String {
        let raw = run.finishedAt ?? run.startedAt
        guard let date = HealthSyncService.parseISO(raw) else { return raw }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
