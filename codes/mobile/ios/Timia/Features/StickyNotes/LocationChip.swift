import SwiftUI
import CoreLocation

/// Pill that displays the resolved location (or a "no location" hint).
struct LocationChip: View {
    let snapshot: StickyNoteLocationSnapshot?
    var onTap: () -> Void = {}
    var onClear: (() -> Void)? = nil

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: "location.fill")
                    .font(.footnote)
                    .foregroundStyle(snapshot == nil ? Color.secondary : Color.blue)
                Text(label)
                    .font(.footnote)
                    .lineLimit(1)
                    .foregroundStyle(snapshot == nil ? .secondary : .primary)
                if snapshot != nil, let onClear {
                    Button {
                        onClear()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.footnote)
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(TimiaTheme.field, in: Capsule())
            .overlay(Capsule().stroke(TimiaTheme.border.opacity(0.5)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(snapshot == nil ? "未设置位置" : "已记录位置")
    }

    private var label: String {
        guard let s = snapshot else { return "添加位置" }
        if let name = s.name, !name.isEmpty { return name }
        return String(format: "📍 (%.4f, %.4f)", s.lat, s.lng)
    }
}
