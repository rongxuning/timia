import CoreGraphics
import Foundation

let scheduleMapFanStepPx = 148.0
let scheduleMapFanVelocityDivisor = 900.0
let scheduleMapFanVelocityClamp = 1.25
let scheduleMapFanEdgeResistance = 0.35
let scheduleMapFanTapSlop = 8.0
let scheduleMapFanTapSpeed = 200.0
let scheduleMapFanFlickDown = 800.0
let scheduleMapFanRadius = 168.0
let scheduleMapFanAngleStepDeg = 16.0
let scheduleMapFanMinAngleStepDeg = 10.0
let scheduleMapFanMaxShift = 48.0
let scheduleMapFanCardHeight = 88.0
let scheduleMapCardWidth = 200.0
let scheduleMapCardHeight = 96.0
let scheduleMapFanTopPad = 24.0

struct ScheduleMapFanSlot: Equatable {
    let rotate: Double
    let scale: Double
    let opacity: Double
}

struct ScheduleMapFanLayout: Equatable {
    let direction: Double
    let shiftX: Double
    let angleStep: Double
}

func applyScheduleMapFanDrag(index: Double, dx: Double, count: Int, step: Double = scheduleMapFanStepPx) -> Double {
    let raw = index - dx / step
    let maxIndex = Double(max(0, count - 1))
    if raw < 0 { return raw * scheduleMapFanEdgeResistance }
    if raw > maxIndex { return maxIndex + (raw - maxIndex) * scheduleMapFanEdgeResistance }
    return raw
}

func snapScheduleMapFanIndex(index: Double, vx: Double, count: Int) -> Int {
    let velocity = min(scheduleMapFanVelocityClamp, max(-scheduleMapFanVelocityClamp, -vx / scheduleMapFanVelocityDivisor))
    let rounded = Int((index + velocity).rounded())
    return min(max(0, count - 1), max(0, rounded))
}

func isScheduleMapFanTap(dx: Double, dy: Double, speed: Double) -> Bool {
    hypot(dx, dy) < scheduleMapFanTapSlop && speed < scheduleMapFanTapSpeed
}

func isScheduleMapFanDismissFlick(vx: Double, vy: Double) -> Bool {
    vy > scheduleMapFanFlickDown && abs(vy) > abs(vx)
}

func scheduleMapFanSlot(offset: Double) -> ScheduleMapFanSlot? {
    let absOffset = abs(offset)
    guard absOffset <= 2 else { return nil }
    let scale = absOffset <= 1 ? 1 - 0.12 * absOffset : 0.88 - 0.12 * (absOffset - 1)
    let opacity = absOffset <= 1 ? 1 - 0.14 * absOffset : 0.86 - 0.3 * (absOffset - 1)
    return ScheduleMapFanSlot(rotate: offset * scheduleMapFanAngleStepDeg, scale: scale, opacity: opacity)
}

func scheduleMapFanLayout(origin: CGPoint, canvas: CGSize) -> ScheduleMapFanLayout {
    let needed = scheduleMapFanRadius + scheduleMapFanCardHeight + scheduleMapFanTopPad
    let direction = origin.y >= needed ? -1.0 : 1.0
    let half = 2 * scheduleMapFanRadius * sin(scheduleMapFanAngleStepDeg * .pi / 180)
    var shiftX = 0.0
    if origin.x - half < 0 { shiftX = min(scheduleMapFanMaxShift, half - origin.x) }
    if origin.x + half > canvas.width {
        shiftX = max(-scheduleMapFanMaxShift, canvas.width - origin.x - half)
    }
    let stillOverflows = origin.x + shiftX - half < 0 || origin.x + shiftX + half > canvas.width
    return ScheduleMapFanLayout(
        direction: direction,
        shiftX: shiftX,
        angleStep: stillOverflows ? scheduleMapFanMinAngleStepDeg : scheduleMapFanAngleStepDeg
    )
}

/// Top of a card relative to the chest anchor. `x` is the horizontal center.
/// Downward fans (`direction > 0`) sit below the pin; upward fans sit above it.
func scheduleMapFanCardOffset(indexOffset: Double, layout: ScheduleMapFanLayout) -> CGPoint {
    let angle = indexOffset * layout.angleStep * .pi / 180
    let arc = (1 - cos(angle)) * scheduleMapFanRadius
    let x = sin(angle) * scheduleMapFanRadius
    if layout.direction > 0 {
        return CGPoint(x: CGFloat(x), y: CGFloat(arc))
    }
    return CGPoint(x: CGFloat(x), y: CGFloat(-arc - scheduleMapFanCardHeight))
}

func scheduleMapFanCloseTotalSeconds(count: Int) -> Double {
    0.28 + Double(max(0, count - 1)) * 0.032
}

let scheduleMapReelStepPx = 58.0
let scheduleMapReelTile = 64.0
let scheduleMapReelGap = 12.0

struct ScheduleMapReelSlot: Equatable {
    let scale: Double
    let opacity: Double
    let y: Double
}

func scheduleMapReelSlot(offset: Double) -> ScheduleMapReelSlot? {
    let absOffset = abs(offset)
    guard absOffset <= 2 else { return nil }
    let scale = absOffset <= 1 ? 1 - 0.22 * absOffset : 0.78 - 0.16 * (absOffset - 1)
    let opacity = absOffset <= 1 ? 1 - 0.28 * absOffset : 0.72 - 0.32 * (absOffset - 1)
    return ScheduleMapReelSlot(scale: scale, opacity: opacity, y: offset * scheduleMapReelStepPx)
}

func scheduleMapReelSide(originX: Double, canvasWidth: Double) -> String {
    let need = scheduleMapReelTile + scheduleMapReelGap + 24
    let half = scheduleMapCardWidth / 2 + 10
    if originX < need + half { return "right" }
    if originX > canvasWidth - half { return "left" }
    return "left"
}
