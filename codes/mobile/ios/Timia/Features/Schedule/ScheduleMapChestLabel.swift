import SwiftUI

struct ScheduleMapChestLabel: View {
    let placeTitle: String
    let count: Int
    var isExpanded: Bool = false

    var body: some View {
        let badge = count > 99 ? "99+" : "\(count)"
        VStack(spacing: 4) {
            ZStack(alignment: .topLeading) {
                ForEach([2, 1], id: \.self) { layer in
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(TimiaTheme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(TimiaTheme.border.opacity(0.55)))
                        .offset(x: CGFloat(layer * 4), y: CGFloat(-layer * 4))
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(placeTitle).font(.caption.weight(.semibold)).lineLimit(1)
                        Text(badge)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(TimiaTheme.primary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(TimiaTheme.primary.opacity(0.12), in: Capsule())
                    }
                    Text("\(count) 个任务")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(TimiaTheme.border.opacity(0.55)))
            }
            Circle()
                .fill(TimiaTheme.primary)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(.white, lineWidth: 2))
        }
        .scaleEffect(isExpanded ? 1.04 : 1)
        .accessibilityLabel("\(placeTitle)，\(count) 个任务，点按查看")
        .accessibilityAddTraits(isExpanded ? .isSelected : [])
    }
}
