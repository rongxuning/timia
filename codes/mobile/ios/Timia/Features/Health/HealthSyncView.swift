import SwiftUI

struct HealthSyncView: View {
    @EnvironmentObject private var session: AppSession
    @StateObject private var permissions = HealthPermissionManager.shared
    @State private var syncedDays: [HealthSyncDayStatus] = []
    @State private var pendingDays: [HealthPendingDay] = []
    @State private var isSyncing = false
    @State private var progressText = ""
    @State private var progress: Double = 0
    @State private var errorMessage: String?
    @State private var quantityGapHint: String?
    @State private var lastSyncedAt: Date?

    private let lastSyncedKey = "timia.health.lastManualSyncAt"

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
                    Button("同步") {
                        Task { await sync() }
                    }
                    .disabled(isSyncing)
                    if let lastSyncedAt {
                        LabeledContent("上次同步", value: lastSyncedAt.formatted(date: .abbreviated, time: .shortened))
                    }
                    Text("新数据会在写入 iPhone「健康」后自动同步；也可随时手动同步。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
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
                    Text(permissions.didRequest ? "点同步后会读取近 90 天数据并按日汇总。" : "授权后即可读取本机健康数据。")
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
                if syncedDays.isEmpty {
                    Text("还没有已同步的日期")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(syncedDays) { day in
                        LabeledContent(day.localDate, value: "\(day.totalCount) 条")
                    }
                }
            }
        }
        .navigationTitle("健康数据")
        .task {
            lastSyncedAt = UserDefaults.standard.object(forKey: lastSyncedKey) as? Date
            await refreshStatus()
        }
        .refreshable { await refreshStatus() }
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
        .alert("同步失败", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("好", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func authorize() async {
        _ = await permissions.requestIfNeeded()
        await HealthBackgroundDelivery.shared.start(api: session.api)
    }

    private func refreshStatus() async {
        do {
            let status = try await HealthSyncAPI(client: session.api)
                .syncStatus(timezone: TimeZone.current.identifier)
            syncedDays = status.days
                .filter { $0.totalCount > 0 }
                .sorted { $0.localDate > $1.localDate }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func sync() async {
        // Always re-request: HealthKit no-ops if unchanged, shows sheet for new read types.
        guard await permissions.requestIfNeeded() else { return }
        isSyncing = true
        progress = 0.05
        progressText = "正在读取健康数据…"
        defer { isSyncing = false }
        do {
            let service = HealthSyncService(api: HealthSyncAPI(client: session.api))
            let export = try await service.readLastNinetyDays()
            pendingDays = HealthSyncService.pendingDays(from: export)
            quantityGapHint = export.samples.isEmpty
                ? "没有读到步数、消耗或心率样本。请在「设置 > 健康 > 数据访问与设备」中允许 Timia 读取这些类型后再同步。"
                : nil
            try await service.upload(export) { fraction, label in
                progress = fraction
                progressText = label
            }
            let now = Date()
            lastSyncedAt = now
            UserDefaults.standard.set(now, forKey: lastSyncedKey)
            pendingDays = []
            await HealthBackgroundDelivery.shared.start(api: session.api)
            await refreshStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
