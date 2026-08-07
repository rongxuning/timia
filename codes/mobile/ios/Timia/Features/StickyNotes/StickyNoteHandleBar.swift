import SwiftUI

/// A small handle shown at the boundary between the editor and the list
/// in ``StickyNoteView``. Renders as a black pill (similar to the iOS
/// home indicator). The whole control is tappable; the visual cue alone
/// is enough for users to discover the drag/tap target.
struct StickyNoteHandleBar: View {
    let isEditorExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            Capsule()
                .fill(Color.primary.opacity(0.85))
                .frame(width: 48, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(TimiaTheme.canvas)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isEditorExpanded ? "收起编辑" : "展开编辑")
    }
}
