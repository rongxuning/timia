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
        case let .signedIn(user):
            MainTabView(user: user)
        }
    }
}
