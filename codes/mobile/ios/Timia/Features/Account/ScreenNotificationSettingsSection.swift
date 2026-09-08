import SwiftUI

/// Account toggle for lock-screen Live Activity preference.
struct ScreenNotificationSettingsSection: View {
    @EnvironmentObject private var session: AppSession
    @StateObject private var manager = ScreenNotificationManager.shared

    var body: some View {
        Section("锁屏通知") {
            Toggle(
                "后台持续运行",
                isOn: Binding(
                    get: { manager.preference.isAllowed },
                    set: { enabled in
                        Task {
                            await manager.applyPreference(enabled ? .allowed : .denied, api: session.api)
                        }
                    }
                )
            )
            Text("开启后锁屏展示健康同步（若已授权）与当日未开始、进行中、逾期、全天待办；App 内改任务后会尽快同步到锁屏。")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let error = manager.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        }
    }
}
