import SwiftUI
import XCTest
@testable import Timia

final class TimiaLiveActivityPaletteTests: XCTestCase {
    func testDarkModeMatchesLockScreenBannerStyle() {
        let palette = TimiaLiveActivityPalette.make(colorScheme: .dark)
        XCTAssertEqual(palette.backgroundHex, "#000000")
        XCTAssertEqual(palette.forcedColorScheme, .dark)
        XCTAssertGreaterThan(palette.backgroundOpacity, 0.45)
        XCTAssertLessThan(palette.backgroundOpacity, 0.75)
        XCTAssertGreaterThan(
            ColorContrast.ratio(palette.backgroundHex, palette.primaryTextHex),
            4.5
        )
        XCTAssertGreaterThan(
            ColorContrast.ratio(palette.backgroundHex, palette.secondaryTextHex),
            3.0
        )
        XCTAssertLessThan(ColorContrast.relativeLuminance(hex: palette.backgroundHex), 0.2)
        XCTAssertGreaterThan(ColorContrast.relativeLuminance(hex: palette.primaryTextHex), 0.8)
    }

    func testLightModeMatchesLockScreenBannerStyle() {
        let palette = TimiaLiveActivityPalette.make(colorScheme: .light)
        XCTAssertEqual(palette.backgroundHex, "#FFFFFF")
        XCTAssertEqual(palette.forcedColorScheme, .light)
        XCTAssertGreaterThan(palette.backgroundOpacity, 0.55)
        XCTAssertLessThan(palette.backgroundOpacity, 0.9)
        XCTAssertGreaterThan(
            ColorContrast.ratio(palette.backgroundHex, palette.primaryTextHex),
            4.5
        )
        XCTAssertGreaterThan(
            ColorContrast.ratio(palette.backgroundHex, palette.secondaryTextHex),
            3.0
        )
        XCTAssertGreaterThan(ColorContrast.relativeLuminance(hex: palette.backgroundHex), 0.8)
        XCTAssertLessThan(ColorContrast.relativeLuminance(hex: palette.primaryTextHex), 0.2)
    }

    func testPalettesPairTintWithMatchingText() {
        let light = TimiaLiveActivityPalette.make(colorScheme: .light)
        let dark = TimiaLiveActivityPalette.make(colorScheme: .dark)
        XCTAssertNotEqual(light.backgroundHex, dark.backgroundHex)
        XCTAssertNotEqual(light.primaryTextHex, dark.primaryTextHex)
        XCTAssertEqual(dark.primaryTextHex, "#FFFFFF")
        XCTAssertEqual(light.primaryTextHex, "#000000")
    }
}
