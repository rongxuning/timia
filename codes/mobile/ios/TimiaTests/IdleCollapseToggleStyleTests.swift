import XCTest
@testable import Timia

final class IdleCollapseToggleStyleTests: XCTestCase {
    func testUsesIconOnlyControlBelowAllDay() {
        XCTAssertTrue(IdleCollapseToggleStyle.usesCustomIcon)
        XCTAssertNil(IdleCollapseToggleStyle.symbolName(collapseEnabled: true))
        XCTAssertNil(IdleCollapseToggleStyle.symbolName(collapseEnabled: false))
        XCTAssertFalse(IdleCollapseToggleStyle.showsTextLabels)
        XCTAssertTrue(IdleCollapseToggleStyle.visibleTitles.isEmpty)
        XCTAssertTrue(IdleCollapseToggleStyle.placesIconBelowAllDay)
        XCTAssertFalse(IdleCollapseToggleStyle.gapBarsShowTimeLabels)
        XCTAssertTrue(TimelineCollapseLayout.disablesHeightAnimation)
    }

    func testAccessibilityDescribesCollapseState() {
        XCTAssertEqual(
            IdleCollapseToggleStyle.accessibilityLabel(collapseEnabled: true),
            "展开全部时段"
        )
        XCTAssertEqual(
            IdleCollapseToggleStyle.accessibilityLabel(collapseEnabled: false),
            "折叠空闲时段"
        )
        XCTAssertEqual(
            IdleCollapseToggleStyle.accessibilityValue(collapseEnabled: true),
            "已折叠空闲"
        )
        XCTAssertEqual(
            IdleCollapseToggleStyle.accessibilityValue(collapseEnabled: false),
            "已展开全部"
        )
    }
}
