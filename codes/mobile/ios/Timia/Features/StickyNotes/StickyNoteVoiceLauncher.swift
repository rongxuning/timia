import SwiftUI

/// Owns the schedule / sticky-note voice session so the bottom dock can morph
/// into a recording bar (cancel · waveform · confirm) without stretching layout.
@MainActor
final class VoiceDockModel: ObservableObject {
    enum Phase: Equatable {
        case idle
        case recording
        case finalizing
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var transcript: String = ""
    @Published private(set) var statusMessage: String? = nil
    @Published private(set) var statusIsError: Bool = false
    /// Newest samples on the trailing edge — drives the live waveform.
    @Published private(set) var levels: [CGFloat] = Array(repeating: 0.12, count: 40)

    private var onCommit: ((String) -> Void)?
    private var onFailed: ((String) -> Void)?
    private var hasFinished = false
    private var didStart = false
    private var sessionToken = UUID()

    private var recognizer: StickyNoteSpeechRecognizer { .shared }

    var isActive: Bool { phase != .idle }
    var isFinalizing: Bool { phase == .finalizing }

    func begin(
        onCommit: @escaping (String) -> Void,
        onFailed: ((String) -> Void)? = nil
    ) {
        guard phase == .idle else { return }
        self.onCommit = onCommit
        self.onFailed = onFailed
        transcript = ""
        statusMessage = nil
        statusIsError = false
        hasFinished = false
        didStart = false
        levels = Array(repeating: 0.12, count: 40)
        sessionToken = UUID()
        let token = sessionToken
        withAnimation(.snappy(duration: 0.28)) {
            phase = .recording
        }
        Task { await prepareAndStart(token: token) }
    }

    func confirm() {
        guard phase == .recording, !hasFinished else { return }
        withAnimation(.snappy(duration: 0.2)) {
            phase = .finalizing
        }
        if didStart {
            recognizer.stopRecording()
        } else {
            // Recognition never started — dismiss without committing.
            finishCancel()
        }
    }

    func cancel() {
        guard isActive, !hasFinished else { return }
        hasFinished = true
        sessionToken = UUID()
        recognizer.cancel()
        resetToIdle()
    }

    private func finishCancel() {
        hasFinished = true
        sessionToken = UUID()
        recognizer.cancel()
        resetToIdle()
    }

    private func resetToIdle() {
        onCommit = nil
        onFailed = nil
        withAnimation(.snappy(duration: 0.28)) {
            phase = .idle
            transcript = ""
            statusMessage = nil
            statusIsError = false
            levels = Array(repeating: 0.12, count: 40)
        }
    }

    private func prepareAndStart(token: UUID) async {
        let prior = SpeechPermissionManager.shared.currentStatus()
        let auth = await SpeechPermissionManager.shared.requestIfNeeded()
        guard token == sessionToken else { return }
        guard auth == .authorized else {
            fail("需要麦克风权限（设置 → Timia）")
            return
        }

        SpeechPermissionManager.shared.refresh()
        guard token == sessionToken else { return }

        if prior != .authorized {
            try? await Task.sleep(for: .milliseconds(300))
            guard token == sessionToken else { return }
        }

        switch OnDeviceSupportChecker.check() {
        case .available:
            break
        case .deviceNotSupported:
            fail("当前设备不支持本地语音识别（模拟器常见）")
            return
        case .localeNotInstalled:
            fail("请下载中文离线语音包（设置 → 通用 → 键盘 → 听写语言）")
            return
        case .localeUnavailable:
            fail("系统未安装中文语音识别器")
            return
        }

        recognizer.onPartial = { [weak self] text in
            Task { @MainActor in
                guard let self, self.sessionToken == token else { return }
                self.transcript = text
            }
        }
        recognizer.onFinal = { [weak self] text in
            Task { @MainActor in
                guard let self, self.sessionToken == token else { return }
                self.complete(with: text)
            }
        }
        recognizer.onError = { [weak self] err in
            Task { @MainActor in
                guard let self, self.sessionToken == token else { return }
                self.fail(err.localizedDescription)
            }
        }
        recognizer.onLevel = { [weak self] level in
            Task { @MainActor in
                guard let self, self.sessionToken == token, self.phase == .recording else { return }
                self.pushLevel(CGFloat(level))
            }
        }

        do {
            try await recognizer.start()
            guard token == sessionToken else {
                recognizer.cancel()
                return
            }
            if recognizer.isRunning {
                didStart = true
                if phase == .finalizing {
                    recognizer.stopRecording()
                }
            }
        } catch {
            guard token == sessionToken else { return }
            fail(error.localizedDescription)
        }
    }

    private func pushLevel(_ level: CGFloat) {
        let boosted = min(1, max(0.08, level))
        var next = levels
        if !next.isEmpty {
            next.removeFirst()
            next.append(boosted)
            levels = next
        }
    }

    private func complete(with text: String) {
        guard !hasFinished else { return }
        hasFinished = true
        let commit = onCommit
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        resetToIdle()
        commit?(trimmed)
    }

    private func fail(_ message: String) {
        guard !hasFinished else { return }
        hasFinished = true
        statusMessage = message
        statusIsError = true
        recognizer.cancel()
        let failed = onFailed
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            self.resetToIdle()
            failed?(message)
        }
    }
}

// MARK: - Idle mic buttons

struct StickyNoteVoiceLauncher: View {
    @ObservedObject var draft: StickyNoteDraftStore
    @ObservedObject var dock: VoiceDockModel

    var body: some View {
        VoiceMicButton(accessibilityId: "sticky-voice-input", isBusy: dock.isActive) {
            dock.begin(
                onCommit: { text in
                    if !text.isEmpty {
                        draft.appendContent(text)
                    }
                    draft.voiceInputCompleted = true
                },
                onFailed: nil
            )
        }
    }
}

struct ScheduleVoiceLauncher: View {
    @ObservedObject var dock: VoiceDockModel
    var isParsing: Bool
    var onRecognized: (String) -> Void
    var onFailed: ((String) -> Void)? = nil

    var body: some View {
        VoiceMicButton(
            accessibilityId: "schedule-voice-input",
            isBusy: dock.isActive || isParsing
        ) {
            dock.begin(onCommit: onRecognized, onFailed: onFailed)
        }
    }
}

struct VoiceMicButton: View {
    var accessibilityId: String
    var isBusy: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Image(systemName: "mic")
                        .font(.body.weight(.semibold))
                }
            }
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(TimiaTheme.primary, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .accessibilityLabel("语音添加")
        .accessibilityIdentifier(accessibilityId)
    }
}

// MARK: - Recording dock (replaces bottom nav)

/// Grok-style recording chrome: cancel · live waveform · confirm.
struct VoiceRecordingDock: View {
    @ObservedObject var dock: VoiceDockModel

    var body: some View {
        HStack(spacing: 14) {
            Button {
                dock.cancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary.opacity(0.75))
                    .frame(width: 44, height: 44)
                    .background(TimiaTheme.field, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("取消语音输入")
            .accessibilityIdentifier("voice-dock-cancel")
            .disabled(dock.isFinalizing)

            VoiceWaveformView(
                levels: dock.levels,
                isFinalizing: dock.isFinalizing,
                statusMessage: dock.statusMessage,
                statusIsError: dock.statusIsError,
                transcript: dock.transcript
            )
            .frame(maxWidth: .infinity)
            .frame(height: 44)

            Button {
                dock.confirm()
            } label: {
                Group {
                    if dock.isFinalizing {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    } else {
                        Image(systemName: "checkmark")
                            .font(.body.weight(.bold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 44, height: 44)
                .background(Color.primary, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("完成语音输入")
            .accessibilityIdentifier("voice-dock-confirm")
            .disabled(dock.isFinalizing || dock.statusIsError)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(TimiaTheme.border.opacity(0.45), lineWidth: 0.5)
        )
        .shadow(color: TimiaTheme.shadow, radius: 16, y: 6)
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .accessibilityIdentifier("voice-recording-dock")
    }
}

struct VoiceWaveformView: View {
    var levels: [CGFloat]
    var isFinalizing: Bool
    var statusMessage: String?
    var statusIsError: Bool
    var transcript: String

    var body: some View {
        ZStack {
            if let statusMessage {
                Text(statusMessage)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(statusIsError ? .red : .secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            } else if isFinalizing {
                Text(transcript.isEmpty ? "识别中…" : transcript)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            } else {
                HStack(alignment: .center, spacing: 2.5) {
                    ForEach(Array(levels.enumerated()), id: \.offset) { index, level in
                        Capsule(style: .continuous)
                            .fill(barColor(for: index, level: level))
                            .frame(width: 2.5, height: max(3, 28 * level))
                    }
                }
                .frame(maxWidth: .infinity)
                .mask(
                    LinearGradient(
                        colors: [.clear, .black, .black, .black],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
            }
        }
        .animation(.easeOut(duration: 0.08), value: levels)
    }

    private func barColor(for index: Int, level: CGFloat) -> Color {
        // Leading edge stays soft (idle dots); trailing edge is the live voice.
        let progress = Double(index) / Double(max(levels.count - 1, 1))
        if progress < 0.35 {
            return Color.primary.opacity(0.18 + 0.15 * level)
        }
        return Color.primary.opacity(0.55 + 0.45 * level)
    }
}
