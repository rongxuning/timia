import SwiftUI

/// Drag handle that toggles between the editor and the list pane in
/// ``StickyNoteView``. Always sits at the visual boundary between the two
/// areas — below the editor when expanded, above the list when collapsed.
struct StickyNoteHandleBar: View {
    let isEditorExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 6) {
                Spacer()
                Image(systemName: isEditorExpanded ? "chevron.up" : "chevron.down")
                    .font(.caption.weight(.medium))
                Text(isEditorExpanded ? "收起编辑" : "展开编辑")
                    .font(.caption.weight(.medium))
                Spacer()
            }
            .padding(.vertical, 10)
            .background(TimiaTheme.canvas)
            .overlay(
                Rectangle()
                    .frame(height: 0.5)
                    .foregroundStyle(TimiaTheme.border),
                alignment: .top
            )
            .overlay(
                Rectangle()
                    .frame(height: 0.5)
                    .foregroundStyle(TimiaTheme.border),
                alignment: .bottom
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isEditorExpanded ? "收起编辑" : "展开编辑")
    }
}
