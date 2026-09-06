import CoreGraphics
import Foundation

enum TimelineSegment: Equatable {
    case visible(MinuteRange)
    case collapsed(MinuteRange)

    var range: MinuteRange {
        switch self {
        case .visible(let range), .collapsed(let range):
            return range
        }
    }
}

struct TimelineGeometry {
    let dayMinutes: Int
    let hourHeight: CGFloat
    let collapsedHeight: CGFloat
    let collapseEnabled: Bool
    let segments: [TimelineSegment]

    init(
        dayMinutes: Int = 1440,
        collapsibleIdles: [MinuteRange] = [],
        hourHeight: CGFloat,
        collapsedHeight: CGFloat,
        collapseEnabled: Bool
    ) {
        self.dayMinutes = dayMinutes
        self.hourHeight = hourHeight
        self.collapsedHeight = collapsedHeight
        self.collapseEnabled = collapseEnabled
        self.segments = Self.buildSegments(
            dayMinutes: dayMinutes,
            collapsibleIdles: collapsibleIdles,
            collapseEnabled: collapseEnabled
        )
    }

    var contentHeight: CGFloat {
        segments.reduce(0) { $0 + segmentHeight($1) }
    }

    func y(forMinutes minutes: Int) -> CGFloat {
        let clamped = min(max(minutes, 0), dayMinutes)
        var y: CGFloat = 0

        for segment in segments {
            let range = segment.range
            if clamped <= range.start {
                return y
            }

            switch segment {
            case .visible:
                if clamped < range.end {
                    let offset = CGFloat(clamped - range.start) / 60 * hourHeight
                    return y + offset
                }
                y += CGFloat(range.duration) / 60 * hourHeight

            case .collapsed:
                if clamped < range.end {
                    let span = range.end - range.start
                    guard span > 0 else { return y }
                    let offset = CGFloat(clamped - range.start) / CGFloat(span) * collapsedHeight
                    return y + offset
                }
                y += collapsedHeight
            }
        }

        return y
    }

    func minutes(atY y: CGFloat) -> Int {
        let clampedY = min(max(y, 0), contentHeight)
        var accumulated: CGFloat = 0

        for segment in segments {
            let height = segmentHeight(segment)
            if clampedY <= accumulated + height {
                let range = segment.range
                switch segment {
                case .visible:
                    let offsetY = clampedY - accumulated
                    let minuteOffset = Int(round(offsetY / hourHeight * 60))
                    return min(range.start + minuteOffset, range.end)
                case .collapsed:
                    return (range.start + range.end) / 2
                }
            }
            accumulated += height
        }

        return dayMinutes
    }

    func height(forDurationMinutes durationMinutes: Int, startingAt startMinutes: Int) -> CGFloat {
        y(forMinutes: startMinutes + durationMinutes) - y(forMinutes: startMinutes)
    }

    private func segmentHeight(_ segment: TimelineSegment) -> CGFloat {
        switch segment {
        case .visible(let range):
            return CGFloat(range.duration) / 60 * hourHeight
        case .collapsed:
            return collapsedHeight
        }
    }

    private static func buildSegments(
        dayMinutes: Int,
        collapsibleIdles: [MinuteRange],
        collapseEnabled: Bool
    ) -> [TimelineSegment] {
        let collapsedRanges: [MinuteRange]
        if collapseEnabled {
            collapsedRanges = mergeRanges(
                collapsibleIdles
                    .map { MinuteRange(start: max(0, $0.start), end: min(dayMinutes, $0.end)) }
                    .filter { $0.end > $0.start }
            )
        } else {
            collapsedRanges = []
        }

        var segments: [TimelineSegment] = []
        var cursor = 0
        var collapseIndex = 0

        while cursor < dayMinutes {
            while collapseIndex < collapsedRanges.count, collapsedRanges[collapseIndex].end <= cursor {
                collapseIndex += 1
            }

            if collapseIndex < collapsedRanges.count, collapsedRanges[collapseIndex].start <= cursor {
                let collapsed = collapsedRanges[collapseIndex]
                let end = min(collapsed.end, dayMinutes)
                segments.append(.collapsed(MinuteRange(start: cursor, end: end)))
                cursor = end
                if collapsed.end <= cursor {
                    collapseIndex += 1
                }
                continue
            }

            let nextCollapseStart = collapseIndex < collapsedRanges.count
                ? collapsedRanges[collapseIndex].start
                : dayMinutes
            let end = min(nextCollapseStart, dayMinutes)
            if end > cursor {
                segments.append(.visible(MinuteRange(start: cursor, end: end)))
            }
            cursor = end
        }

        return segments
    }

    private static func mergeRanges(_ ranges: [MinuteRange]) -> [MinuteRange] {
        let sorted = ranges.sorted { $0.start < $1.start }
        guard var current = sorted.first else { return [] }
        var merged: [MinuteRange] = []

        for next in sorted.dropFirst() {
            if next.start <= current.end {
                current.end = max(current.end, next.end)
            } else {
                merged.append(current)
                current = next
            }
        }
        merged.append(current)
        return merged
    }
}
