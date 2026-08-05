import SwiftUI

/// The voice button that lives in the bottom toolbar when ``contentMode == .stickyNote``.
///
/// Long-press to record; release to commit. The recognized text is appended
/// to the shared ``StickyNoteDraftStore`` so it lands in the same input box
/// the user is typing in.
struct StickyNoteVoiceLauncher: View {
    let session: AppSession
    @ObservedObject var draft: StickyNoteDraftStore

    @State private var isPressed: Bool = false
    @State private var showOverlay: Bool = false
    @State private var overlay: RecordingOverlay? = nil
    @State private var pressTimer: Task<Void, Never>? = nil

    var body: some View {
        Button(action: {}) {
            HStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(isPressed ? .red : .white)
                Text(isPressed ? "说话中…" : "按住说话")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isPressed ? .red : .white)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(
                isPressed ? Color.red.opacity(0.12) : TimiaTheme.primary,
                in: Capsule()
            )
        }
        .buttonStyle(.plain)
        .simultaneousGesture(longPressGesture)
        .fullScreenCover(isPresented: $showOverlay, onDismiss: {
            overlay = nil
            isPressed = false
        }) {
            overlay
        }
    }

    // MARK: - Long-press gesture

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.15)
            .onChanged { _ in
                guard !isPressed else { return }
                isPressed = true
                beginRecording()
            }
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onEnded { _ in
                endRecording()
            }
    }

    private func beginRecording() {
        let view = RecordingOverlay(
            draft: draft,
            onCommit: { text in
                Task { @MainActor in
                    draft.appendContent(text)
                    showOverlay = false
                }
            },
            onCancel: {
                Task { @MainActor in
                    showOverlay = false
                }
            }
        )
        overlay = view
        showOverlay = true
    }

    private func endRecording() {
        // The overlay's own task drives the recognizer; we just need to call stop().
        overlay?.stop()
        // Hide will happen via overlay onCommit / onCancel.
    }
}
