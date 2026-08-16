import SwiftUI

func isCalendarTaskCompleted(_ status: String) -> Bool {
    status == "done" || status == "archived"
}

func desaturateHex(_ hex: String, amount: Double = 0.72) -> String {
    let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")).uppercased()
    let clamped = min(max(amount, 0), 1)
    var parsed: UInt64 = 0
    guard value.count == 6, Scanner(string: value).scanHexInt64(&parsed) else { return hex }
    if clamped == 0 { return "#\(value)" }
    let red = Double((parsed >> 16) & 0xFF) / 255
    let green = Double((parsed >> 8) & 0xFF) / 255
    let blue = Double(parsed & 0xFF) / 255
    let (hue, saturation, lightness) = rgbToHsl(red: red, green: green, blue: blue)
    let (outRed, outGreen, outBlue) = hslToRgb(
        hue: hue,
        saturation: saturation * (1 - clamped),
        lightness: lightness
    )
    return String(
        format: "#%02X%02X%02X",
        Int((outRed * 255).rounded()),
        Int((outGreen * 255).rounded()),
        Int((outBlue * 255).rounded())
    )
}

struct CalendarCompletedHatch: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 6
            let lineWidth: CGFloat = 1.25
            let color = Color.gray.opacity(colorScheme == .dark ? 0.28 : 0.22)
            let extra = size.height
            var x: CGFloat = -extra
            while x < size.width + extra {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + extra, y: size.height))
                context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                x += step
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct CalendarCompletedCardFill: View {
    let color: Color
    let isCompleted: Bool
    var cornerRadius: CGFloat

    var body: some View {
        ZStack {
            color
            if isCompleted {
                CalendarCompletedHatch()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

extension View {
    func thickStrikethrough(_ active: Bool, color: Color? = nil) -> some View {
        modifier(ThickStrikethroughModifier(active: active, color: color))
    }
}

private struct ThickStrikethroughModifier: ViewModifier {
    let active: Bool
    let color: Color?

    func body(content: Content) -> some View {
        content
            .strikethrough(active, pattern: .solid, color: color)
            .overlay {
                if active {
                    content
                        .foregroundStyle(.clear)
                        .strikethrough(true, pattern: .solid, color: color ?? Color.primary.opacity(0.82))
                        .offset(y: 0.85)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
    }
}

private func rgbToHsl(red: Double, green: Double, blue: Double) -> (Double, Double, Double) {
    let maxChannel = max(red, green, blue)
    let minChannel = min(red, green, blue)
    let lightness = (maxChannel + minChannel) / 2
    guard maxChannel != minChannel else {
        return (0, 0, lightness)
    }
    let delta = maxChannel - minChannel
    let saturation = lightness > 0.5 ? delta / (2 - maxChannel - minChannel) : delta / (maxChannel + minChannel)
    let hue: Double
    if maxChannel == red {
        hue = (green - blue) / delta + (green < blue ? 6 : 0)
    } else if maxChannel == green {
        hue = (blue - red) / delta + 2
    } else {
        hue = (red - green) / delta + 4
    }
    return (hue / 6, saturation, lightness)
}

private func hslToRgb(hue: Double, saturation: Double, lightness: Double) -> (Double, Double, Double) {
    guard saturation > 0 else {
        return (lightness, lightness, lightness)
    }
    func hueToChannel(_ p: Double, _ q: Double, _ t: Double) -> Double {
        var wrapped = t
        if wrapped < 0 { wrapped += 1 }
        if wrapped > 1 { wrapped -= 1 }
        if wrapped < 1 / 6 { return p + (q - p) * 6 * wrapped }
        if wrapped < 1 / 2 { return q }
        if wrapped < 2 / 3 { return p + (q - p) * (2 / 3 - wrapped) * 6 }
        return p
    }
    let q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
    let p = 2 * lightness - q
    return (
        hueToChannel(p, q, hue + 1 / 3),
        hueToChannel(p, q, hue),
        hueToChannel(p, q, hue - 1 / 3)
    )
}
