import SwiftUI

/// Voice recording button for sticky-note mode and schedule (todo/calendar) mode.
///
/// Tap mic → mic becomes a red stop square + a compact floating glass
/// breathing circle appears *above* the button.
///
/// Important: the floating HUD must stay intrinsically sized (`fixedSize`).
/// A flexible / infinite-height overlay inside bottom `safeAreaInset` causes an
/// immediate layout feedback crash (app quits on mic tap).
struct StickyNoteVoiceLauncher: View {
    @ObservedObject var draft: StickyNoteDraftStore

    var body: some View {
        VoiceCaptureButton(accessibilityId: "sticky-voice-input") { text in
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                draft.appendContent(trimmed)
            }
            draft.voiceInputCompleted = true
        }
    }
}

/// Schedule (todo / calendar) voice button: recognized text is handed to the
/// parent so it can NLP-parse and present the task editor overlay.
struct ScheduleVoiceLauncher: View {
    var isParsing: Bool
    var onRecognized: (String) -> Void
    var onFailed: ((String) -> Void)? = nil

    var body: some View {
        VoiceCaptureButton(
            isExternalBusy: isParsing,
            accessibilityId: "schedule-voice-input",
            onCommit: onRecognized,
            onFailed: onFailed
        )
    }
}

// MARK: - Shared voice capture control

struct VoiceCaptureButton: View {
    var isExternalBusy: Bool = false
    var accessibilityId: String = "voice-input"
    var onCommit: (String) -> Void
    var onFailed: ((String) -> Void)? = nil

    @State private var phase: Phase = .idle
    /// Stable identity for the recording HUD so SwiftUI layout passes don't
    /// destroy/recreate it (which raced `cancel` vs `start` and crashed).
    @State private var recordingSession = UUID()

    private enum Phase: Equatable {
        case idle
        case recording
        case finalizing
    }

    private var isRecording: Bool { phase == .recording }
    private var showsOverlay: Bool { phase == .recording || phase == .finalizing }
    private var isBusy: Bool { phase == .finalizing || isExternalBusy }

    var body: some View {
        Button(action: toggle) {
            Group {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else if isRecording {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 14, weight: .bold))
                } else {
                    Image(systemName: "mic")
                        .font(.body.weight(.semibold))
                }
            }
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(
                isRecording ? Color.red : TimiaTheme.primary,
                in: RoundedRectangle(cornerRadius: isRecording ? 8 : 19)
            )
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .accessibilityLabel(isRecording ? "停止语音输入" : "语音添加")
        .accessibilityIdentifier(accessibilityId)
        .animation(.snappy(duration: 0.2), value: phase)
        .overlay(alignment: .bottom) {
            if showsOverlay {
                VoiceRecordingOverlay(
                    isFinalizing: phase == .finalizing,
                    onFinished: { text in
                        phase = .idle
                        onCommit(text)
                    },
                    onFailed: { message in
                        phase = .idle
                        onFailed?(message)
                    }
                )
                .id(recordingSession)
                .fixedSize()
                .offset(y: -96)
                .transition(.opacity.combined(with: .scale(scale: 0.92)))
            }
        }
        .animation(.snappy(duration: 0.25), value: showsOverlay)
    }

    private func toggle() {
        switch phase {
        case .idle:
            recordingSession = UUID()
            phase = .recording
        case .recording:
            phase = .finalizing
        case .finalizing:
            break
        }
    }
}

// MARK: - Voice Recording Overlay

struct VoiceRecordingOverlay: View {
    var isFinalizing: Bool
    var onFinished: (String) -> Void
    var onFailed: (String) -> Void

    @State private var transcript: String = ""
    @State private var statusMsg: String? = nil
    @State private var statusIsError: Bool = false
    @State private var didStart: Bool = false
    @State private var hasFinished: Bool = false

    private var recognizer: StickyNoteSpeechRecognizer { .shared }

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .stroke(TimiaTheme.primary.opacity(0.25), lineWidth: 3)
                    .frame(width: 88, height: 88)
                    .modifier(PulsingModifier())

                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 64, height: 64)
                    .overlay {
                        if !transcript.isEmpty {
                            Text(transcript)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(6)
                                .lineLimit(3)
                        } else {
                            Image(systemName: "waveform")
                                .font(.system(size: 20))
                                .foregroundStyle(TimiaTheme.primary)
                        }
                    }
            }

            Group {
                if let msg = statusMsg {
                    Text(msg)
                        .foregroundStyle(statusIsError ? .red : .secondary)
                } else if isFinalizing {
                    Text("识别中…")
                        .foregroundStyle(.secondary)
                } else if transcript.isEmpty {
                    Text("请说话…")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.caption2)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 160)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
        .fixedSize()
        .allowsHitTesting(false)
        .task {
            await prepareAndStart()
        }
        .onChange(of: isFinalizing) { _, finalizing in
            guard finalizing, didStart, !hasFinished else { return }
            recognizer.stopRecording()
        }
        .onDisappear {
            if !hasFinished {
                recognizer.cancel()
            }
        }
    }

    private func prepareAndStart() async {
        let auth = await SpeechPermissionManager.shared.requestIfNeeded()
        guard !Task.isCancelled else { return }
        guard auth == .authorized else {
            statusMsg = "需要麦克风权限（设置 → Timia）"
            statusIsError = true
            finishFailure("需要麦克风权限")
            return
        }

        SpeechPermissionManager.shared.refresh()
        guard !Task.isCancelled else { return }

        switch OnDeviceSupportChecker.check() {
        case .available:
            break
        case .deviceNotSupported:
            statusMsg = "当前设备不支持语音识别"
            statusIsError = true
            finishFailure(statusMsg ?? "")
            return
        case .localeNotInstalled:
            statusMsg = "请下载中文离线语音包（设置 → 通用 → 键盘 → 听写语言）"
            statusIsError = true
            finishFailure(statusMsg ?? "")
            return
        case .localeUnavailable:
            statusMsg = "系统未安装中文语音识别器"
            statusIsError = true
            finishFailure(statusMsg ?? "")
            return
        }

        recognizer.onPartial = { text in
            Task { @MainActor in
                transcript = text
            }
        }
        recognizer.onFinal = { text in
            Task { @MainActor in
                guard !hasFinished else { return }
                hasFinished = true
                onFinished(text)
            }
        }
        recognizer.onError = { err in
            Task { @MainActor in
                guard !hasFinished else { return }
                statusMsg = err.localizedDescription
                statusIsError = true
                finishFailure(err.localizedDescription)
            }
        }

        do {
            try await recognizer.start()
            guard !Task.isCancelled else {
                recognizer.cancel()
                return
            }
            if recognizer.isRunning {
                didStart = true
                if isFinalizing {
                    recognizer.stopRecording()
                }
            }
        } catch {
            guard !Task.isCancelled else { return }
            statusMsg = error.localizedDescription
            statusIsError = true
            finishFailure(error.localizedDescription)
        }
    }

    private func finishFailure(_ message: String) {
        guard !hasFinished else { return }
        hasFinished = true
        recognizer.cancel()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(900))
            onFailed(message)
        }
    }
}

// MARK: - Breathing animation

struct PulsingModifier: ViewModifier {
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.6

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                    scale = 1.12
                    opacity = 0.25
                }
            }
    }
}
