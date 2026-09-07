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
    /// Interpolating every loaded day/week grid between collapsed and 24h height
    /// stalls the main thread inside the infinite LazyVStack.
    static let disablesHeightAnimation = true
}

enum IdleCollapseToggleStyle {
    static let showsTextLabels = false
    static let visibleTitles: [String] = []
    static let gapBarsShowTimeLabels = false
    static let placesIconBelowAllDay = true

    static func symbolName(collapseEnabled: Bool) -> String {
        collapseEnabled ? "chevron.compact.down" : "chevron.compact.up"
    }

    static func accessibilityLabel(collapseEnabled: Bool) -> String {
        collapseEnabled ? "展开全部时段" : "折叠空闲时段"
    }

    static func accessibilityValue(collapseEnabled: Bool) -> String {
        collapseEnabled ? "已折叠空闲" : "已展开全部"
    }
}
