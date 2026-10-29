import Foundation

enum WeChatAuthGate {
    /// errCode 0 is success. -2 is the user canceling inside WeChat.
    static func code(errCode: Int, code: String?, state: String?, expectedState: String) -> String? {
        guard errCode == 0, !expectedState.isEmpty, state == expectedState else { return nil }
        guard let code, !code.isEmpty else { return nil }
        return code
    }
}

enum WeChatAuthPending {
    static let key = "timia.wechat.oauth.state"

    static func save(_ state: String, defaults: UserDefaults = .standard) {
        defaults.set(state, forKey: key)
    }

    static func consume(defaults: UserDefaults = .standard) -> String? {
        let value = defaults.string(forKey: key)
        defaults.removeObject(forKey: key)
        return value
    }
}

struct WeChatAuthPayload: Equatable {
    var errCode: Int
    var code: String
    var state: String
}

@MainActor
enum WeChatAuthInbox {
    static var latest: WeChatAuthPayload?
    /// Scene and application delegate can both deliver one return. Drop the duplicate.
    private static var lastDelivery: (payload: WeChatAuthPayload, at: Date)?

    static func store(errCode: Int, code: String?, state: String?) {
        let payload = WeChatAuthPayload(errCode: errCode, code: code ?? "", state: state ?? "")
        let now = Date()
        if let lastDelivery,
           lastDelivery.payload == payload,
           now.timeIntervalSince(lastDelivery.at) < 2 {
            return
        }
        lastDelivery = (payload, now)
        latest = payload
        NotificationCenter.default.post(name: .timiaWeChatAuthFinished, object: nil)
    }

    static func take() -> WeChatAuthPayload? {
        defer { latest = nil }
        return latest
    }

    static func reset() {
        latest = nil
        lastDelivery = nil
    }
}

extension Notification.Name {
    static let timiaWeChatAuthFinished = Notification.Name("timia.wechat.auth.finished")
}

enum WeChatOpenSDKLogin {
    static var sdkAvailable: Bool { WeChatSDKBridge.sdkAvailable() }

    static func bundleValue(_ key: String, bundle: Bundle = .main) -> String? {
        guard let raw = bundle.object(forInfoDictionaryKey: key) as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.contains("$(") { return nil }
        return trimmed
    }

    /// Register before any URL arrives. OpenSDK ignores a cold-start callback until this runs.
    @discardableResult
    static func registerIfConfigured(bundle: Bundle = .main) -> Bool {
        guard let appID = bundleValue("TIMIA_WECHAT_APP_ID", bundle: bundle),
              let universalLink = bundleValue("TIMIA_WECHAT_UNIVERSAL_LINK", bundle: bundle) else {
            return false
        }
        guard sdkAvailable else { return false }
        return register(appID: appID, universalLink: universalLink)
    }

    @discardableResult
    static func register(appID: String, universalLink: String) -> Bool {
        WeChatSDKBridge.registerAppID(appID, universalLink: universalLink)
    }

    @discardableResult
    static func send(appID: String, universalLink: String, state: String) -> Bool {
        WeChatSDKBridge.sendAuthAppID(appID, universalLink: universalLink, state: state)
    }
}

enum WeChatSceneRouter {
    @discardableResult
    static func open(url: URL) -> Bool {
        WeChatOpenSDKLogin.registerIfConfigured()
        // +handleOpenURL: is imported as handleOpen(_:) (Swift 3; the ObjC selector is unchanged).
        return WeChatSDKBridge.handleOpen(url)
    }

    @discardableResult
    static func continueActivity(_ activity: NSUserActivity) -> Bool {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb else { return false }
        WeChatOpenSDKLogin.registerIfConfigured()
        return WeChatSDKBridge.handleUniversalLink(activity)
    }
}
