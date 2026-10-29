import XCTest
@testable import Timia

final class WeChatOpenSDKLoginTests: XCTestCase {
    func testUnionOfCodeAndState() {
        XCTAssertEqual(
            WeChatAuthGate.code(errCode: 0, code: "auth-code", state: "s", expectedState: "s"),
            "auth-code"
        )
        XCTAssertNil(WeChatAuthGate.code(errCode: -2, code: "auth-code", state: "s", expectedState: "s"))
        XCTAssertNil(WeChatAuthGate.code(errCode: 0, code: "auth-code", state: "other", expectedState: "s"))
        XCTAssertNil(WeChatAuthGate.code(errCode: 0, code: "", state: "s", expectedState: "s"))
        XCTAssertNil(WeChatAuthGate.code(errCode: 0, code: "auth-code", state: "s", expectedState: ""))
    }

    func testPendingStateIsSingleUse() {
        let suite = "timia.wechat.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        WeChatAuthPending.save("state-1", defaults: defaults)
        XCTAssertEqual(WeChatAuthPending.consume(defaults: defaults), "state-1")
        XCTAssertNil(WeChatAuthPending.consume(defaults: defaults))
    }

    func testSendWithoutLinkedSDKDoesNotStart() {
        if WeChatOpenSDKLogin.sdkAvailable {
            return
        }
        XCTAssertFalse(
            WeChatOpenSDKLogin.send(
                appID: "wxdemo",
                universalLink: "https://timia.online/wechat/",
                state: "state"
            )
        )
        XCTAssertFalse(
            WeChatOpenSDKLogin.register(
                appID: "wxdemo",
                universalLink: "https://timia.online/wechat/"
            )
        )
    }

    func testRegisterIfConfiguredSkipsBundlesWithoutCredentials() {
        XCTAssertFalse(WeChatOpenSDKLogin.registerIfConfigured(bundle: Bundle(for: WeChatOpenSDKLoginTests.self)))
    }

    func testNonWebActivityIsNotAWeChatReturn() {
        let activity = NSUserActivity(activityType: "com.timia.not-web")
        XCTAssertFalse(WeChatSceneRouter.continueActivity(activity))
    }

    func testGoogleStepUpBodyCarriesPKCE() throws {
        let body = OAuthLoginRequest(
            installationId: "installation-id-0001",
            challengeId: UUID().uuidString,
            nonce: String(repeating: "n", count: 32),
            signature: String(repeating: "s", count: 80),
            idToken: nil,
            code: "link-code",
            redirectUri: nil,
            codeVerifier: nil
        ).applying(
            IdentityStepUp(
                provider: "google",
                oauthCode: "auth-code",
                redirectURI: "https://timia.online/core-service/auth/mobile/oauth/google/callback",
                codeVerifier: "verifier-123"
            )
        )
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let object = try JSONSerialization.jsonObject(with: encoder.encode(body))
        let json = try XCTUnwrap(object as? [String: Any])
        XCTAssertEqual(json["step_up_provider"] as? String, "google")
        XCTAssertEqual(json["step_up_oauth_code"] as? String, "auth-code")
        XCTAssertEqual(
            json["step_up_redirect_uri"] as? String,
            "https://timia.online/core-service/auth/mobile/oauth/google/callback"
        )
        XCTAssertEqual(json["step_up_code_verifier"] as? String, "verifier-123")
    }
}

@MainActor
final class WeChatAuthInboxTests: XCTestCase {
    override func setUp() {
        super.setUp()
        WeChatAuthInbox.reset()
    }

    override func tearDown() {
        WeChatAuthInbox.reset()
        super.tearDown()
    }

    func testPayloadWaitsUntilTheLoginViewAppears() {
        WeChatAuthInbox.store(errCode: 0, code: "auth-code", state: "state-1")
        let payload = WeChatAuthInbox.take()
        XCTAssertEqual(payload?.errCode, 0)
        XCTAssertEqual(payload?.code, "auth-code")
        XCTAssertEqual(payload?.state, "state-1")
        XCTAssertNil(WeChatAuthInbox.take())
    }

    func testDuplicateDeliveryDoesNotRestoreATakenPayload() {
        WeChatAuthInbox.store(errCode: 0, code: "auth-code", state: "state-1")
        XCTAssertNotNil(WeChatAuthInbox.take())
        WeChatAuthInbox.store(errCode: 0, code: "auth-code", state: "state-1")
        XCTAssertNil(WeChatAuthInbox.take())
    }
}
