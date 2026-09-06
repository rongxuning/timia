import Foundation

enum CalendarInfiniteWindow {
    static let dayOffsets = -120...120
    static let weekOffsets = -16...16
    static let weekRecenterThreshold = 12

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
    var dragForcesExpandAll: Bool = false
    var scrollDisabled: Bool = false
    var interactionsArmed: Bool = false

    var effectiveCollapse: Bool {
        idleCollapseEnabled && !dragForcesExpandAll
    }

    mutating func armInteractions() {
        interactionsArmed = true
    }

    mutating func beginDrag() {
        guard interactionsArmed else { return }
        dragForcesExpandAll = true
        scrollDisabled = true
    }

    mutating func endDrag() {
        dragForcesExpandAll = false
        scrollDisabled = false
    }

    mutating func resetTransient() {
        dragForcesExpandAll = false
        scrollDisabled = false
        interactionsArmed = false
    }

    mutating func toggleCollapse() {
        idleCollapseEnabled.toggle()
    }
}

enum IdleCollapseToggleStyle {
    static let symbolName = "rectangle.compress.vertical"
    static let showsTextLabels = false
    static let visibleTitles: [String] = []

    static func accessibilityLabel(collapseEnabled: Bool) -> String {
        collapseEnabled ? "展开全部时段" : "折叠空闲时段"
    }

    static func accessibilityValue(collapseEnabled: Bool) -> String {
        collapseEnabled ? "已折叠空闲" : "已展开全部"
    }
}
