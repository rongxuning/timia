import SwiftUI

enum TimiaTheme {
    static let primary = Color("AccentColor")
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let surface = Color(uiColor: .systemBackground)
    static let field = Color(uiColor: .tertiarySystemGroupedBackground)
    static let border = Color(uiColor: .separator)
    static let shadow = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor.black.withAlphaComponent(0.34)
            : UIColor.black.withAlphaComponent(0.12)
    })

    static func customSurface(_ hex: String) -> Color {
        isDefaultColor(hex) ? card : Color(hex: hex)
    }

    static func foreground(on hex: String) -> Color {
        guard !isDefaultColor(hex),
              let rgb = rgbComponents(hex) else {
            return .primary
        }

        let luminance = 0.2126 * linear(rgb.red)
            + 0.7152 * linear(rgb.green)
            + 0.0722 * linear(rgb.blue)
        return luminance > 0.42 ? .black : .white
    }

    private static func isDefaultColor(_ hex: String) -> Bool {
        hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "#FFFFFF"
    }

    private static func rgbComponents(_ hex: String) -> (red: Double, green: Double, blue: Double)? {
        let normalized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        guard normalized.count == 6,
              let value = UInt64(normalized, radix: 16) else {
            return nil
        }
        return (
            Double((value >> 16) & 0xFF) / 255,
            Double((value >> 8) & 0xFF) / 255,
            Double(value & 0xFF) / 255
        )
    }

    private static func linear(_ component: Double) -> Double {
        component <= 0.04045
            ? component / 12.92
            : pow((component + 0.055) / 1.055, 2.4)
    }
}

enum TaskStatusPalette {
    static let todo = Color(hex: "#64748B")
    static let doing = Color(hex: "#3B82F6")
    static let done = Color(hex: "#10B981")
    static let archived = Color(hex: "#8B5CF6")

    static func color(for status: String) -> Color {
        switch status {
        case "doing": doing
        case "done": done
        case "archived": archived
        default: todo
        }
    }
}

extension Color {
    init(hex: String) {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0xFFFFFF
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

struct StatCard: View {
    let title: String
    let value: Int
    let symbol: String
    var tint: Color = TimiaTheme.primary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol).foregroundStyle(tint)
            Text(value, format: .number).font(.title2.bold())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(TimiaTheme.card, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct TaskGroupHeader: View {
    let title: String
    let symbol: String
    let count: Int
    let color: Color

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)

            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)

            Spacer()

            Text(count, format: .number)
                .font(.caption.bold())
                .foregroundStyle(color)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(color.opacity(0.1), in: Capsule())
        }
    }
}
