import SwiftUI
import XCTest
@testable import Timia

final class TimiaLiveActivityPaletteTests: XCTestCase {
    func testDarkModeUsesDarkBackgroundAndLightText() {
        let palette = TimiaLiveActivityPalette.make(colorScheme: .dark)
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

    func testLightModeUsesLightBackgroundAndDarkText() {
        let palette = TimiaLiveActivityPalette.make(colorScheme: .light)
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

    func testPalettesDifferAcrossColorSchemes() {
        let light = TimiaLiveActivityPalette.make(colorScheme: .light)
        let dark = TimiaLiveActivityPalette.make(colorScheme: .dark)
        XCTAssertNotEqual(light.backgroundHex, dark.backgroundHex)
        XCTAssertNotEqual(light.primaryTextHex, dark.primaryTextHex)
    }
}
