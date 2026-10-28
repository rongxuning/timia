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

    static func store(errCode: Int, code: String?, state: String?) {
        latest = WeChatAuthPayload(errCode: errCode, code: code ?? "", state: state ?? "")
        NotificationCenter.default.post(name: .timiaWeChatAuthFinished, object: nil)
    }

    static func take() -> WeChatAuthPayload? {
        defer { latest = nil }
        return latest
    }
}

extension Notification.Name {
    static let timiaWeChatAuthFinished = Notification.Name("timia.wechat.auth.finished")
}

enum WeChatOpenSDKLogin {
    static var sdkAvailable: Bool { WeChatSDKBridge.sdkAvailable() }

    @discardableResult
    static func send(appID: String, universalLink: String, state: String) -> Bool {
        WeChatSDKBridge.sendAuthAppID(appID, universalLink: universalLink, state: state)
    }
}
