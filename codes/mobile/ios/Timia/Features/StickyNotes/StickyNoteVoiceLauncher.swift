import SwiftUI

// MARK: - Observable wrapper for recognizer

/// Tiny ObservableObject wrapper so we can use @StateObject with the
/// non-ObservableObject recognizer class.
@MainActor
final class RecognizerBox: ObservableObject {
    let recognizer = StickyNoteSpeechRecognizer()
}

/// Voice recording button for sticky-note mode.
///
/// Tap mic → mic becomes a red square stop button + a floating glass
/// breathing circle appears above the bottom toolbar. Tapping the red
/// square stops recording and opens the editor with recognized text.
struct StickyNoteVoiceLauncher: View {
    let session: AppSession
    @ObservedObject var draft: StickyNoteDraftStore

    @State private var isRecording: Bool = false
    @State private var isOverlayVisible: Bool = false

    var body: some View {
        Button(action: { isRecording ? stopRecording() : startRecording() }) {
            Group {
                if isRecording {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 14, weight: .bold))
                } else {
                    Image(systemName: "mic")
                        .font(.body.weight(.semibold))
                }
            }
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(isRecording ? Color.red : TimiaTheme.primary, in: RoundedRectangle(cornerRadius: isRecording ? 8 : 19))
        }
        .buttonStyle(.plain)
        .animation(.snappy(duration: 0.2), value: isRecording)
        .overlay(alignment: .bottom) {
            if isOverlayVisible {
                VoiceRecordingOverlay(
                    draft: draft,
                    onDismiss: stopRecording
                )
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.snappy(duration: 0.25), value: isOverlayVisible)
    }

    private func startRecording() {
        isRecording = true
        isOverlayVisible = true
    }

    private func stopRecording() {
        isRecording = false
        withAnimation(.snappy(duration: 0.2)) {
            isOverlayVisible = false
        }
    }
}

// MARK: - Voice Recording Overlay

/// Floating overlay shown above the bottom toolbar while recording.
/// Displays a glass-effect circle with breathing animation.
struct VoiceRecordingOverlay: View {
    @ObservedObject var draft: StickyNoteDraftStore
    @StateObject private var recognizerBox = RecognizerBox()
    @StateObject private var permissions = SpeechPermissionManager.shared
    @State private var transcript: String = ""
    @State private var statusMsg: String? = nil
    @State private var statusIsError: Bool = false
    @State private var didStart: Bool = false
    /// Set by the recognizer's onFinal so we can stop the recognizer only once.
    @State private var hasCommitted: Bool = false

    var onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 16) {
                // Breathing circle button.
                ZStack {
                    // Pulsing outer ring.
                    Circle()
                        .stroke(TimiaTheme.primary.opacity(0.25), lineWidth: 3)
                        .frame(width: 100, height: 100)
                        .modifier(PulsingModifier())

                    // Glass inner circle.
                    Circle()
                        .fill(.ultraThinMaterial)
                        .frame(width: 72, height: 72)
                        .overlay {
                            if !transcript.isEmpty {
                                Text(transcript)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                                    .padding(8)
                                    .lineLimit(3)
                            } else {
                                Image(systemName: "waveform")
                                    .font(.system(size: 22))
                                    .foregroundStyle(TimiaTheme.primary)
                            }
                        }
                }

                if let msg = statusMsg {
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(statusIsError ? .red : .secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                } else if transcript.isEmpty {
                    Text("请说话...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 120) // above the bottom toolbar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            await prepareAndStart()
        }
        .onDisappear {
            if !hasCommitted {
                if didStart {
                    recognizerBox.recognizer.stopRecording()
                } else {
                    recognizerBox.recognizer.cancel()
                }
            }
        }
    }

    private func prepareAndStart() async {
        let auth = await permissions.requestIfNeeded()
        guard auth == .authorized else {
            statusMsg = "需要麦克风权限（设置 → Timia）"
            statusIsError = true
            return
        }

        let check = OnDeviceSupportChecker.check()
        switch check {
        case .available: break
        case .deviceNotSupported:
            statusMsg = "当前设备不支持语音识别"
            statusIsError = true
            return
        case .localeNotInstalled:
            statusMsg = "请下载中文离线语音包（设置 → 通用 → 键盘 → 听写语言）"
            statusIsError = true
            return
        case .localeUnavailable:
            statusMsg = "系统未安装中文语音识别器"
            statusIsError = true
            return
        }

        let recognizer = recognizerBox.recognizer
        recognizer.onPartial = { text in
            Task { @MainActor in transcript = text }
        }
        recognizer.onFinal = { [self] text in
            hasCommitted = true
            recognizer.stopRecording()
            commit(text)
        }
        recognizer.onError = { err in
            Task { @MainActor in
                statusMsg = err.localizedDescription
                statusIsError = true
            }
        }

        do {
            try recognizer.start()
            didStart = true
        } catch {
            statusMsg = error.localizedDescription
            statusIsError = true
        }
    }

    private func commit(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            draft.voiceInputCompleted = true
            return
        }
        draft.appendContent(trimmed)
        draft.voiceInputCompleted = true
    }
}

// MARK: - Breathing animation modifier

struct PulsingModifier: ViewModifier {
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.6

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .opacity(opacity)
            .animation(
                .easeInOut(duration: 1.4)
                .repeatForever(autoreverses: true),
                value: scale
            )
            .animation(
                .easeInOut(duration: 1.4)
                .repeatForever(autoreverses: true),
                value: opacity
            )
            .onAppear {
                scale = 1.12
                opacity = 0.25
            }
    }
}
