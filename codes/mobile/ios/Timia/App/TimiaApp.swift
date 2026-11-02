import SwiftUI

@main
struct TimiaApp: App {
    @UIApplicationDelegateAdaptor(TimiaAppDelegate.self) private var appDelegate
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(TimiaTheme.primary)
                .task { await session.restore() }
                .onOpenURL { url in
                    WeChatSceneRouter.open(url: url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    WeChatSceneRouter.continueActivity(activity)
                }
        }
    }
}

private struct RootView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    /// True after the scene has been in the background, so an inactive flicker does not sync.
    @State private var leftForeground = false

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
                .screenNotificationPrompt()
                .task {
                    await HealthBackgroundDelivery.shared.start(api: session.api)
                    await HealthBackgroundDelivery.shared.catchUp()
                }
                .task {
                    PushTokenStore.shared.bind(client: session.notificationApi)
                    await RemotePushPermission.register()
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        let catchUp = leftForeground
                        leftForeground = false
                        Task {
                            if catchUp {
                                await HealthBackgroundDelivery.shared.start(api: session.api)
                                await HealthBackgroundDelivery.shared.catchUp()
                            }
                            await ScreenNotificationManager.shared.refreshIfStale(api: session.api)
                            PushTokenStore.shared.bind(client: session.notificationApi)
                            await RemotePushPermission.register()
                        }
                    case .background:
                        leftForeground = true
                        HealthBackgroundDelivery.shared.scheduleAppRefresh()
                    case .inactive:
                        break
                    }
                }
        }
    }
}
