import CoreGraphics
import Foundation

enum YearMonthGrid {
    static let columnCount = 7
    static let weekCount = 6
    static let cellSpacing: CGFloat = 2
    static var cellCount: Int { columnCount * weekCount }

    /// Width / height of the 6×7 heatmap when cells are square.
    static func heatmapAspectRatio(cellSide: CGFloat = 10) -> CGFloat {
        let width = CGFloat(columnCount) * cellSide + CGFloat(columnCount - 1) * cellSpacing
        let height = CGFloat(weekCount) * cellSide + CGFloat(weekCount - 1) * cellSpacing
        return width / height
    }
}

struct YearMonthGridCell: Equatable, Identifiable {
    let index: Int
    let dayNumber: Int?
    let taskCount: Int

    var id: Int { index }
    var inMonth: Bool { dayNumber != nil }
}

func yearMonthGridCells(
    year: Int,
    month: Int,
    taskCountByDayKey: [String: Int] = [:],
    calendar: Calendar = .current
) -> [YearMonthGridCell] {
    let total = YearMonthGrid.cellCount
    guard let first = calendar.date(from: DateComponents(year: year, month: month, day: 1)),
          let dayCount = calendar.range(of: .day, in: .month, for: first)?.count else {
        return (0..<total).map { YearMonthGridCell(index: $0, dayNumber: nil, taskCount: 0) }
    }

    // Match the existing year heatmap: Sunday-start columns (weekday 1 = Sunday).
    let leadingBlanks = calendar.component(.weekday, from: first) - 1

    return (0..<total).map { index in
        let dayNumber = index - leadingBlanks + 1
        guard dayNumber >= 1, dayNumber <= dayCount else {
            return YearMonthGridCell(index: index, dayNumber: nil, taskCount: 0)
        }
        let key = String(format: "%04d-%02d-%02d", year, month, dayNumber)
        return YearMonthGridCell(
            index: index,
            dayNumber: dayNumber,
            taskCount: taskCountByDayKey[key] ?? 0
        )
    }
}
