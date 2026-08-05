import SwiftUI

/// Small circular voice button that lives in the bottom toolbar when
/// ``contentMode == .stickyNote``.
///
/// Long-press to record; release to commit. Recognized text is appended to
/// the shared ``StickyNoteDraftStore``.
struct StickyNoteVoiceLauncher: View {
    let session: AppSession
    @ObservedObject var draft: StickyNoteDraftStore

    @State private var isPressed: Bool = false
    @State private var showOverlay: Bool = false
    @State private var overlay: RecordingOverlay? = nil

    var body: some View {
        Button(action: {}) {
            Image(systemName: isPressed ? "mic.fill" : "mic")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(isPressed ? Color.red : TimiaTheme.primary, in: Circle())
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
        overlay?.stop()
    }
}
