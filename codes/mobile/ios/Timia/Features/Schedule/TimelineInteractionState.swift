import Foundation

enum CalendarInfiniteWindow {
    static let dayOffsets = -30...30
    static let weekOffsets = -16...16
    static let dayRecenterThreshold = 22
    static let weekRecenterThreshold = 12

    static func shouldRecenterDayAnchor(
        from anchor: Date,
        to date: Date,
        calendar: Calendar = .current
    ) -> Bool {
        let delta = calendar.dateComponents([.day], from: anchor, to: date).day ?? 0
        return abs(delta) > dayRecenterThreshold
    }

    static func shouldRecenterWeekAnchor(
        from anchor: Date,
        to date: Date,
        calendar: Calendar = .current
    ) -> Bool {
        let delta = calendar.dateComponents([.weekOfYear], from: anchor, to: date).weekOfYear ?? 0
        return abs(delta) > weekRecenterThreshold
    }
}

struct TimelineInteractionState: Equatable, Sendable {
    var idleCollapseEnabled: Bool
    var scrollDisabled: Bool = false
    var interactionsArmed: Bool = false

    var effectiveCollapse: Bool {
        idleCollapseEnabled
    }

    var allowsTaskDrag: Bool {
        !effectiveCollapse
    }

    mutating func armInteractions() {
        interactionsArmed = true
    }

    mutating func beginDrag() {
        guard interactionsArmed, allowsTaskDrag else { return }
        scrollDisabled = true
    }

    mutating func endDrag() {
        scrollDisabled = false
    }

    mutating func resetTransient() {
        scrollDisabled = false
        interactionsArmed = false
    }

    mutating func toggleCollapse() {
        idleCollapseEnabled.toggle()
        scrollDisabled = false
    }
}

enum TimelineCollapseLayout {
    /// Interpolating a 24h grid between collapsed and expanded height is expensive
    /// enough that collapse toggles should snap instead of animating height.
    static let disablesHeightAnimation = true
}

enum IdleCollapseToggleStyle {
    static let showsTextLabels = false
    static let visibleTitles: [String] = []
    static let gapBarsShowTimeLabels = false
    static let placesIconBelowAllDay = true
    static let usesCustomIcon = true

    static func symbolName(collapseEnabled _: Bool) -> String? {
        nil
    }

    static func accessibilityLabel(collapseEnabled: Bool) -> String {
        collapseEnabled ? "展开全部时段" : "折叠空闲时段"
    }

    static func accessibilityValue(collapseEnabled: Bool) -> String {
        collapseEnabled ? "已折叠空闲" : "已展开全部"
    }
}
