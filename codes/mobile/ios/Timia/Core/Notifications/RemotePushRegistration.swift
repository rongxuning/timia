import Foundation
import UIKit
import UserNotifications

/// Asks for alert permission and registers with APNs. Simulator registration
/// fails quietly; the inbox does not depend on a device token.
@MainActor
enum RemotePushPermission {
    static func register() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        let allowed: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            allowed = true
        case .notDetermined:
            allowed = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        case .denied:
            allowed = false
        @unknown default:
            allowed = false
        }
        guard allowed else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }
}

/// Holds the latest device token and uploads it once a notification API client exists.
@MainActor
final class PushTokenStore {
    static let shared = PushTokenStore()

    private var client: APIClient?
    private(set) var latestToken: String?

    func bind(client: APIClient) {
        self.client = client
        guard let latestToken else { return }
        let token = latestToken
        Task { await self.upload(token) }
    }

    func noteDeviceToken(_ data: Data) {
        let hex = APNsDeviceToken.hexString(from: data)
        guard hex.count >= 64 else { return }
        latestToken = hex
        Task { await upload(hex) }
    }

    func clear() {
        latestToken = nil
        client = nil
    }

    private func upload(_ token: String) async {
        guard let client else { return }
        do {
            _ = try await NotificationAPI(client: client).registerDeviceToken(token)
        } catch {
            // The next foreground pass retries. Inbox delivery does not depend on this.
        }
    }
}

final class TimiaAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        WeChatSDKBridge.setAuthCompletion { errCode, code, state in
            let codeText = code
            let stateText = state
            Task { @MainActor in
                WeChatAuthInbox.store(errCode: errCode, code: codeText, state: stateText)
            }
        }
        WeChatOpenSDKLogin.registerIfConfigured()
        return true
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        WeChatSceneRouter.open(url: url)
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        WeChatSceneRouter.continueActivity(userActivity)
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = Data(deviceToken)
        Task { @MainActor in
            PushTokenStore.shared.noteDeviceToken(token)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Expected on the simulator and on builds without the push capability.
    }

    /// The center calls this off the main actor. The class is main-actor isolated
    /// through `UIApplicationDelegate`, so the witness has to opt out.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }
}
