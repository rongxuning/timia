import Foundation

struct MinuteRange: Equatable, Hashable, Sendable {
    var start: Int
    var end: Int // exclusive
    var duration: Int { end - start }
}

enum IdleCollapsePlanner {
    static func busyRanges(from placements: [(startMinutes: Int, durationMinutes: Int)]) -> [MinuteRange] {
        let sorted = placements
            .map { MinuteRange(start: max(0, $0.startMinutes), end: min(1440, $0.startMinutes + max(0, $0.durationMinutes))) }
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start }
        guard var current = sorted.first else { return [] }
        var result: [MinuteRange] = []
        for next in sorted.dropFirst() {
            if next.start <= current.end {
                current.end = max(current.end, next.end)
            } else {
                result.append(current)
                current = next
            }
        }
        result.append(current)
        return result
    }

    static func idleRanges(busy: [MinuteRange], dayMinutes: Int = 1440) -> [MinuteRange] {
        var cursor = 0
        var idles: [MinuteRange] = []
        for b in busy.sorted(by: { $0.start < $1.start }) {
            if b.start > cursor { idles.append(MinuteRange(start: cursor, end: b.start)) }
            cursor = max(cursor, b.end)
        }
        if cursor < dayMinutes { idles.append(MinuteRange(start: cursor, end: dayMinutes)) }
        return idles
    }

    static func collapsibleIdles(idle: [MinuteRange], thresholdMinutes: Int = 120) -> [MinuteRange] {
        idle.filter { $0.duration >= thresholdMinutes }
    }

    /// 从可折叠列表中剔除覆盖 [now-pad, now+pad] 的部分（拆段）。
    static func protectNow(idles: [MinuteRange], nowMinutes: Int?, padMinutes: Int = 30) -> [MinuteRange] {
        guard let now = nowMinutes else { return idles }
        let protect = MinuteRange(start: max(0, now - padMinutes), end: min(1440, now + padMinutes))
        return idles.flatMap { gap -> [MinuteRange] in
            let overlapStart = max(gap.start, protect.start)
            let overlapEnd = min(gap.end, protect.end)
            guard overlapStart < overlapEnd else { return [gap] }
            var parts: [MinuteRange] = []
            if gap.start < overlapStart { parts.append(MinuteRange(start: gap.start, end: overlapStart)) }
            if overlapEnd < gap.end { parts.append(MinuteRange(start: overlapEnd, end: gap.end)) }
            return parts
        }
    }

    static func unionBusy(_ days: [[MinuteRange]]) -> [MinuteRange] {
        busyRanges(from: days.flatMap { day in day.map { (startMinutes: $0.start, durationMinutes: $0.duration) } })
    }
}
