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
    }
}
