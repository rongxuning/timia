import SwiftUI

@main
struct TimiaApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(TimiaTheme.primary)
                .task { await session.restore() }
        }
    }
}

private struct RootView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        switch session.state {
        case .loading:
            ProgressView("正在载入 Timia…")
        case .signedOut:
            AuthenticationView()
        case let .restoreUnavailable(message):
            ContentUnavailableView {
                Label("暂时无法恢复登录", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("重试") {
                    Task { await session.restore() }
                }
                .buttonStyle(.borderedProminent)
            }
        case let .signedIn(user):
            MainTabView(user: user)
        }
    }
}
