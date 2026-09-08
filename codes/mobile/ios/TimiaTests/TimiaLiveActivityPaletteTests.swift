import SwiftUI
import XCTest
@testable import Timia

final class TimiaLiveActivityPaletteTests: XCTestCase {
    func testDarkModeMatchesLockScreenBannerStyle() {
        let palette = TimiaLiveActivityPalette.make(colorScheme: .dark)
        XCTAssertEqual(palette.backgroundHex, "#1C1C1E")
        XCTAssertEqual(palette.secondaryTextHex, "#8E8E93")
        XCTAssertEqual(palette.forcedColorScheme, .dark)
        XCTAssertEqual(palette.backgroundOpacity, 1.0, accuracy: 0.001)
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

    func testTaskProgressStyleMatchesCalendarStatusChrome() {
        XCTAssertEqual(TaskProgressStyle.symbolName(for: "todo"), "circle")
        XCTAssertEqual(TaskProgressStyle.symbolName(for: "doing"), "clock.fill")
        XCTAssertEqual(TaskProgressStyle.symbolName(for: "done"), "checkmark.circle.fill")
        XCTAssertEqual(TaskProgressStyle.symbolName(for: "archived"), "archivebox.fill")
        XCTAssertEqual(TaskProgressStyle.symbolName(for: "unknown"), "circle")

        XCTAssertEqual(TaskProgressStyle.colorHex(for: "todo"), "#64748B")
        XCTAssertEqual(TaskProgressStyle.colorHex(for: "doing"), "#3B82F6")
        XCTAssertEqual(TaskProgressStyle.colorHex(for: "done"), "#10B981")
        XCTAssertEqual(TaskProgressStyle.colorHex(for: "archived"), "#8B5CF6")
        XCTAssertEqual(TaskProgressStyle.colorHex(for: "unknown"), "#64748B")
        XCTAssertEqual(TaskProgressStyle.accessibilityLabel(for: "todo"), "未开始")
        XCTAssertEqual(TaskProgressStyle.accessibilityLabel(for: "doing"), "进行中")
        XCTAssertEqual(TaskProgressStyle.accessibilityLabel(for: "done"), "已完成")
        XCTAssertEqual(TaskProgressStyle.accessibilityLabel(for: "archived"), "已归档")
    }
}
