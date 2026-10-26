import CoreGraphics
import Foundation

/// Fixed geometry for the schedule home month grid.
/// Weekday headers use `columnSpacing` and `horizontalInset` so they sit on the same columns.
enum MonthDayMetrics {
    static let visibleTaskCount = 5
    /// Titles longer than this many Characters render as `limit - 1` characters plus "…".
    static let titleCharacterLimit = 5

    static let dateSize: CGFloat = 28
    static let taskHeight: CGFloat = 15
    /// One "+N" line. Reserved in every row so a sixth task cannot grow that week.
    static let overflowHeight: CGFloat = 12
    static let spacing: CGFloat = 3
    static let tapBuffer: CGFloat = 12

    static let columnSpacing: CGFloat = 1
    static let rowSpacing: CGFloat = 1
    static let cellHorizontalPadding: CGFloat = 1
    static let horizontalInset: CGFloat = 6

    static var rowHeight: CGFloat {
        stackedHeight(taskRows: visibleTaskCount, includesOverflow: true)
    }

    /// Minimum height of a day column: date, task rows, optional "+N", and the trailing spacer.
    /// The spacer is flexible, but the gap before it is not, so it is included here.
    static func stackedHeight(taskRows: Int, includesOverflow: Bool) -> CGFloat {
        let rows = max(taskRows, 0)
        let overflow = includesOverflow ? overflowHeight : 0
        let gaps = rows + (includesOverflow ? 1 : 0) + 1
        return dateSize
            + CGFloat(rows) * taskHeight
            + overflow
            + CGFloat(gaps) * spacing
    }
}

/// Month-cell task title.
/// Counts Swift Characters (a CJK ideograph, a Latin letter, and a grapheme cluster each count as one).
/// `limit` characters or fewer stay whole. Longer titles keep the first `limit - 1` characters and a trailing "…".
func monthTaskTitle(_ title: String, limit: Int = MonthDayMetrics.titleCharacterLimit) -> String {
    guard limit > 0 else { return "" }
    guard title.count > limit else { return title }
    return String(title.prefix(limit - 1)) + "…"
}
