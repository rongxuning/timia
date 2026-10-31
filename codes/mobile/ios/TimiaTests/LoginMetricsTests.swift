import XCTest
@testable import Timia

final class LoginMetricsTests: XCTestCase {
    func testProviderIconButtonsMeetHitTarget() {
        XCTAssertGreaterThanOrEqual(LoginMetrics.providerIconSide, 44)
        XCTAssertGreaterThan(LoginMetrics.providerLogoSide, 0)
        XCTAssertLessThan(LoginMetrics.providerLogoSide, LoginMetrics.providerIconSide)
        XCTAssertGreaterThan(LoginMetrics.providerSymbolPointSize, 0)
        XCTAssertLessThan(LoginMetrics.providerSymbolPointSize, LoginMetrics.providerIconSide)
    }

    func testProviderIconRowFitsNarrowPhoneAndStaysGroupedOnWideCards() {
        for screen in [CGFloat(320), 375, 390] {
            let content = screen * 0.58 - 36
            let spacing = LoginMetrics.providerIconSpacing(contentWidth: content)
            let row = LoginMetrics.providerIconSide * 3 + spacing * 2
            XCTAssertGreaterThanOrEqual(spacing, 0)
            XCTAssertLessThanOrEqual(row, content + 0.01, "screen \(screen)")
        }

        let wideContent = 1024 * 0.58 - 36
        let wideSpacing = LoginMetrics.providerIconSpacing(contentWidth: wideContent)
        XCTAssertEqual(wideSpacing, LoginMetrics.providerIconMaxSpacing)
        let wideRow = LoginMetrics.providerIconSide * 3 + wideSpacing * 2
        XCTAssertLessThan(wideRow, wideContent)
    }

    func testProviderButtonsKeepChineseVoiceOverLabelsAndExistingMarks() {
        XCTAssertEqual(LoginMetrics.phoneAccessibilityLabel, "本手机号登录")
        XCTAssertEqual(LoginMetrics.weChatAccessibilityLabel, "微信登录")
        XCTAssertEqual(LoginMetrics.googleAccessibilityLabel, "Google 登录")
        XCTAssertEqual(LoginMetrics.phoneSymbolName, "phone.fill")
        XCTAssertEqual(LoginMetrics.weChatAssetName, "WeChatLogo")
        XCTAssertEqual(LoginMetrics.googleAssetName, "GoogleLogo")
        XCTAssertFalse(LoginMetrics.phoneAccessibilityLabel.isEmpty)
        XCTAssertFalse(LoginMetrics.weChatAccessibilityLabel.isEmpty)
        XCTAssertFalse(LoginMetrics.googleAccessibilityLabel.isEmpty)
    }
}
