import SwiftUI

/// One-shot prompt: allow Timia to keep a lock-screen Live Activity running.
struct ScreenNotificationPromptModifier: ViewModifier {
    @EnvironmentObject private var session: AppSession
    @StateObject private var manager = ScreenNotificationManager.shared
    @State private var showPrompt = false

    func body(content: Content) -> some View {
        content
            .task {
                await bootstrap()
            }
            .alert("允许 Timia 在后台持续运行？", isPresented: $showPrompt) {
                Button("允许") {
                    Task { await allow() }
                }
                Button("不允许", role: .cancel) {
                    Task { await deny() }
                }
            } message: {
                Text("允许后，锁屏将展示健康同步状态与当日未开始、逾期、全天待办；Timia 会尽量在后台保持同步与刷新。")
            }
    }

    private func bootstrap() async {
        switch manager.preference {
        case .unset:
            // Brief delay so the home screen settles before the system alert.
            try? await Task.sleep(for: .milliseconds(600))
            showPrompt = true
        case .allowed:
            await manager.startIfAllowed(api: session.api)
        case .denied:
            break
        }
    }

    private func allow() async {
        showPrompt = false
        await manager.applyPreference(.allowed, api: session.api)
    }

    private func deny() async {
        showPrompt = false
        await manager.applyPreference(.denied, api: nil)
    }
}

extension View {
    func screenNotificationPrompt() -> some View {
        modifier(ScreenNotificationPromptModifier())
    }
}
