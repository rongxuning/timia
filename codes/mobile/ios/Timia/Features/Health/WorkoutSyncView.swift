import HealthKit
import SwiftUI

struct WorkoutSyncView: View {
    @EnvironmentObject private var session: AppSession
    @StateObject private var permissions = HealthPermissionManager.shared
    @State private var pending: [WorkoutPendingItem] = []
    @State private var syncedRuns: [HealthSyncRun] = []
    @State private var isSyncing = false
    @State private var progressText = ""
    @State private var progress: Double = 0
    @State private var lastSyncedAt: Date?
    @State private var syncError: HealthSyncFailure?
    @State private var lastErrorSummary: String?

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
                    Button(isSyncing ? "同步中…" : "同步全部") {
                        Task { await sync() }
                    }
                    .disabled(isSyncing)
                    if let lastSyncedAt {
                        LabeledContent("上次同步", value: lastSyncedAt.formatted(date: .abbreviated, time: .shortened))
                    }
                    if let lastErrorSummary, !isSyncing {
                        Text("上次失败：\(lastErrorSummary)")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                    Text("按场次上传训练信封和路线，不含心率曲线。曲线随健康数据同步出现。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let hint = permissions.lastError {
                    Text(hint).foregroundStyle(.red)
                }
            }

            Section("待同步") {
                if pending.isEmpty {
                    Text(permissions.didRequest ? "当前没有待同步的训练。" : "授权后即可读取本机训练。")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(pending) { item in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.workout.activityTitle)
                                Text(item.workout.startAt)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("同步这场") {
                                Task { await sync(onlyHkUuid: item.workout.hkUuid) }
                            }
                            .disabled(isSyncing)
                        }
                    }
                }
            }

            Section("已同步") {
                if syncedRuns.isEmpty {
                    Text("还没有同步记录")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(syncedRuns) { run in
                        VStack(alignment: .leading, spacing: 4) {
                            LabeledContent(run.sourceLabel, value: "训练 \(run.workoutCount)")
                            Text(run.summary)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("训练记录")
        .task {
            lastSyncedAt = WorkoutSyncService.cachedLastSyncedAt()
            await refreshStatus()
            await loadPending()
        }
        .refreshable {
            await refreshStatus()
            await loadPending()
        }
        .overlay {
            if isSyncing {
                ZStack {
                    Color.black.opacity(0.45).ignoresSafeArea()
                    VStack(spacing: 16) {
                        ProgressView(value: progress)
                            .progressViewStyle(.linear)
                        Text(progressText.isEmpty ? "正在同步训练…" : progressText)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                    }
                    .padding(24)
                    .frame(maxWidth: 320)
                    .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                }
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
    }

    private func authorize() async {
        _ = await permissions.requestIfNeeded()
        await HealthBackgroundDelivery.shared.start(api: session.api)
        await loadPending()
    }

    private func refreshStatus() async {
        do {
            let status = try await HealthSyncAPI(client: session.api)
                .syncStatus(timezone: TimeZone.current.identifier, pipeline: "workout")
            syncedRuns = (status.runs ?? []).filter { ($0.pipeline ?? "workout") == "workout" }
            lastSyncedAt = await WorkoutSyncService.applyServerWatermark(
                status.lastWorkoutSyncedAt.flatMap(HealthSyncService.parseISO)
            )
        } catch {}
    }

    private func loadPending() async {
        guard HKHealthStore.isHealthDataAvailable(), permissions.didRequest else { return }
        do {
            pending = try await WorkoutSyncService(api: HealthSyncAPI(client: session.api)).listPending()
        } catch {}
    }

    private func sync(onlyHkUuid: String? = nil) async {
        guard await permissions.requestIfNeeded() else { return }
        isSyncing = true
        progress = 0.02
        progressText = onlyHkUuid == nil ? "正在同步训练…" : "正在上传这场训练…"
        syncError = nil
        do {
            await refreshStatus()
            let service = WorkoutSyncService(api: HealthSyncAPI(client: session.api))
            try await service.syncFromWatermark(
                lastSyncedAt,
                source: .manual,
                onlyHkUuid: onlyHkUuid
            ) { fraction, label in
                progress = max(0.02, fraction)
                progressText = label
            }
            isSyncing = false
            lastErrorSummary = nil
            await refreshStatus()
            await HealthBackgroundDelivery.shared.start(api: session.api)
            await loadPending()
        } catch {
            isSyncing = false
            let failure = HealthSyncFailure.other(message: error.localizedDescription)
            syncError = failure
            lastErrorSummary = error.localizedDescription
            await refreshStatus()
            await loadPending()
        }
    }
}
