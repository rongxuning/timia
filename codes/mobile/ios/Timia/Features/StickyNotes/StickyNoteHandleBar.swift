import SwiftUI

/// A small handle shown at the boundary between the editor and the list
/// in ``StickyNoteView``. Renders as a black pill (similar to the iOS
/// home indicator). The actual drag gesture is handled by the parent
/// ``StickyNoteView`` on the full panel area; this view only provides
/// the visual pill and VoiceOver support.
struct StickyNoteHandleBar: View {
    let isEditorExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        Capsule()
            .fill(Color.primary.opacity(0.85))
            .frame(width: 48, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(TimiaTheme.canvas)
            // No drag gesture here — the parent VStack handles it.
            // VoiceOver users can double-tap the pill to toggle.
            .accessibilityLabel(isEditorExpanded ? "收起编辑" : "展开编辑")
            .accessibilityHint(isEditorExpanded ? "向上滑动收起" : "向下滑动展开")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onToggle() }
    }
}
