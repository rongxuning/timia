import SwiftUI

/// Full-screen recording overlay. Shown when the user holds the voice button.
///
/// Behavior:
///   * Streams partial text from the recognizer into the title bar.
///   * Final text (on release) is appended to the shared draft store via
///     ``onCommit`` and the overlay dismisses.
///   * Sliding up cancels the recording (discards the result).
struct RecordingOverlay: View {
    @ObservedObject var draft: StickyNoteDraftStore
    @StateObject private var permissions = SpeechPermissionManager.shared
    private var recognizer: StickyNoteSpeechRecognizer { StickyNoteSpeechRecognizer.shared }
    @State private var partialText: String = ""
    @State private var statusMessage: String? = nil
    @State private var statusIsError: Bool = false
    @State private var dragOffset: CGFloat = 0
    @State private var didStart: Bool = false
    var onCommit: (String) -> Void
    var onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer()
                VStack(spacing: 6) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.red)
                    Text("收听中…")
                        .font(.headline)
                    Text(partialText.isEmpty ? "请说话" : partialText)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.center)
                        .frame(minHeight: 40)
                        .padding(.horizontal, 16)
                }
                if let msg = statusMessage {
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(statusIsError ? .red : .secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                }
                Spacer()
                Text("松手结束 · 上滑取消")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 40)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(TimiaTheme.surface)
                    .shadow(radius: 20)
            )
            .padding(24)
            .offset(y: max(dragOffset, -120))
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if value.translation.height < 0 {
                            dragOffset = value.translation.height
                        }
                    }
                    .onEnded { value in
                        if value.translation.height < -80 {
                            cancel()
                        } else {
                            withAnimation(.snappy(duration: 0.2)) { dragOffset = 0 }
                        }
                    }
            )
        }
        .task {
            await prepareAndStart()
        }
        .onDisappear {
            recognizer.cancel()
        }
    }

    // MARK: - Internals

    private func prepareAndStart() async {
        let status = await permissions.requestIfNeeded()
        guard status == .authorized else {
            statusMessage = "需要麦克风 / 语音识别权限（设置 → Timia）"
            statusIsError = true
            return
        }
        let availability = OnDeviceSupportChecker.check()
        switch availability {
        case .available:
            break
        case .deviceNotSupported:
            statusMessage = "当前设备不支持本地语音识别"
            statusIsError = true
            return
        case .localeNotInstalled:
            statusMessage = "需要下载中文离线语音包（设置 → 通用 → 键盘 → 听写语言）"
            statusIsError = true
            return
        case .localeUnavailable:
            statusMessage = "系统未安装中文语音识别器"
            statusIsError = true
            return
        }

        recognizer.onPartial = { text in
            partialText = text
        }
        recognizer.onFinal = { text in
            onCommit(text)
        }
        recognizer.onError = { err in
            statusMessage = err.localizedDescription
            statusIsError = true
        }

        do {
            try recognizer.start()
            didStart = true
        } catch {
            statusMessage = error.localizedDescription
            statusIsError = true
        }
    }

    private func cancel() {
        recognizer.cancel()
        onCancel()
    }

    /// Called by parent on release of the long-press. We commit if we
    /// managed to start, otherwise just dismiss.
    func stopRecording() {
        if didStart {
            recognizer.stopRecording()
        } else {
            onCancel()
        }
    }
}
