import CoreGraphics
import Foundation
import SwiftUI

enum TimelineIdleChrome {
    static let blockYOffset: CGFloat = 4
    static let collapsedHeight: CGFloat = 28
    static let dayHorizontalInset: CGFloat = 9
    static let weekHorizontalInset: CGFloat = 2
    static let gapCornerRadius: CGFloat = 10
    static let dayCornerRadius: CGFloat = 16
    static let weekCornerRadius: CGFloat = 7
    static let labelWidth: CGFloat = 48
    static let trailingGutter: CGFloat = 6

    static func horizontalInset(isDayMode: Bool) -> CGFloat {
        isDayMode ? dayHorizontalInset : weekHorizontalInset
    }

    static func taskCornerRadius(isDayMode: Bool) -> CGFloat {
        isDayMode ? dayCornerRadius : weekCornerRadius
    }

    static func contentWidth(in containerWidth: CGFloat) -> CGFloat {
        max(containerWidth - labelWidth - trailingGutter, 1)
    }

    struct VerticalLayout: Equatable {
        var y: CGFloat
        var height: CGFloat
        var topRadius: CGFloat
        var bottomRadius: CGFloat
    }

    struct GapLayout: Equatable {
        var x: CGFloat
        var y: CGFloat
        var width: CGFloat
        var height: CGFloat
        var topRadius: CGFloat
        var bottomRadius: CGFloat
    }

    static func taskVerticalLayout(
        startMinutes: Int,
        durationMinutes: Int,
        geometry: TimelineGeometry,
        cornerRadius: CGFloat,
        minimumHeight: CGFloat
    ) -> VerticalLayout {
        let endMinutes = startMinutes + durationMinutes
        let yStart = geometry.y(forMinutes: startMinutes)
        let yEnd = geometry.y(forMinutes: endMinutes)
        let joinsTop = geometry.collapsedSegmentEnds(at: startMinutes)
        let joinsBottom = geometry.collapsedSegmentStarts(at: endMinutes)
        let topNudge: CGFloat = joinsTop ? 0 : blockYOffset
        let bottomNudge: CGFloat = joinsBottom ? 0 : blockYOffset
        let y = yStart + topNudge
        let flushHeight = max(yEnd + bottomNudge - y, 1)
        let height = joinsBottom ? flushHeight : max(flushHeight, minimumHeight)
        return VerticalLayout(
            y: y,
            height: height,
            topRadius: joinsTop ? 0 : cornerRadius,
            bottomRadius: joinsBottom ? 0 : cornerRadius
        )
    }

    static func gapLayout(
        range: MinuteRange,
        geometry: TimelineGeometry,
        contentWidth: CGFloat,
        horizontalInset: CGFloat,
        taskStarts: Set<Int>,
        taskEnds: Set<Int>
    ) -> GapLayout {
        let joinsTop = taskEnds.contains(range.start)
        let joinsBottom = taskStarts.contains(range.end)
        return GapLayout(
            x: labelWidth + horizontalInset,
            y: geometry.y(forMinutes: range.start),
            width: max(contentWidth - horizontalInset * 2, 1),
            height: collapsedHeight,
            topRadius: joinsTop ? 0 : gapCornerRadius,
            bottomRadius: joinsBottom ? 0 : gapCornerRadius
        )
    }
}

struct IdleCollapseIcon: View {
    var body: some View {
        Canvas { context, size in
            let color = Color.secondary
            let cx = size.width / 2
            let boxWidth = size.width * 0.64
            let boxHeight = size.height * 0.30
            let box = CGRect(
                x: cx - boxWidth / 2,
                y: size.height * 0.5 - boxHeight / 2,
                width: boxWidth,
                height: boxHeight
            )
            let boxPath = RoundedRectangle(
                cornerRadius: min(boxWidth, boxHeight) * 0.42,
                style: .continuous
            ).path(in: box)
            context.stroke(boxPath, with: .color(color), lineWidth: max(1.4, size.width * 0.08))

            let arrowWidth = size.width * 0.30
            let arrowHeight = size.height * 0.155
            let gap = size.height * 0.055

            var down = Path()
            let downTop = box.minY - gap - arrowHeight
            down.move(to: CGPoint(x: cx - arrowWidth / 2, y: downTop))
            down.addLine(to: CGPoint(x: cx + arrowWidth / 2, y: downTop))
            down.addLine(to: CGPoint(x: cx, y: downTop + arrowHeight))
            down.closeSubpath()
            context.fill(down, with: .color(color))

            var up = Path()
            let upBottom = box.maxY + gap + arrowHeight
            up.move(to: CGPoint(x: cx - arrowWidth / 2, y: upBottom))
            up.addLine(to: CGPoint(x: cx + arrowWidth / 2, y: upBottom))
            up.addLine(to: CGPoint(x: cx, y: upBottom - arrowHeight))
            up.closeSubpath()
            context.fill(up, with: .color(color))
        }
        .accessibilityHidden(true)
    }
}
