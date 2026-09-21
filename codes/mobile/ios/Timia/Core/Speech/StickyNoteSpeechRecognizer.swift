import Foundation
import AVFoundation
import Speech

/// Shared on-device Chinese speech recognizer.
///
/// **Not** `@MainActor`: `installTap` and `recognitionTask` callbacks run on
/// audio / Speech queues. Marking this type `@MainActor` made those closures
/// inherit main-actor isolation; the audio thread then traps with
/// `EXC_BREAKPOINT` (Swift 6 isolation check) and the UI appears frozen.
///
/// Public `start` / `stop` / `cancel` are still expected to be called from the
/// main actor (SwiftUI). UI callbacks (`onPartial` / `onFinal` / `onError`)
/// are always dispatched onto the main actor.
final class StickyNoteSpeechRecognizer: @unchecked Sendable {
    static let shared = StickyNoteSpeechRecognizer()

    enum RecognizerError: LocalizedError {
        case onDeviceNotSupported
        case engineFailedToStart(String)
        case recognizerUnavailable
        case invalidAudioFormat
        case noResult

        var errorDescription: String? {
            switch self {
            case .onDeviceNotSupported: return "当前设备 / 系统不支持本地语音识别"
            case .engineFailedToStart(let m): return "录音启动失败：\(m)"
            case .recognizerUnavailable: return "语音识别器不可用"
            case .invalidAudioFormat: return "麦克风尚未就绪，请再试一次"
            case .noResult: return "未识别到有效内容"
            }
        }
    }

    private let stateLock = NSLock()
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isTapInstalled = false
    /// Bumped on every `start` / `cancel` so in-flight async work can bail out.
    private var sessionID = UUID()
    private var _isRunning = false

    var onPartial: ((String) -> Void)?
    var onFinal: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    var isRunning: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return _isRunning
    }

    private func activateAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        // Apple's "Recognizing Speech in Live Audio" sample uses `.record`.
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try? session.setPreferredSampleRate(44_100)
        try? session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        guard session.isInputAvailable else {
            throw RecognizerError.invalidAudioFormat
        }
    }

    private func removeTapIfNeeded_locked() {
        guard isTapInstalled, let engine = audioEngine else {
            isTapInstalled = false
            return
        }
        _ = ObjCExceptionCatcher.perform({
            engine.inputNode.removeTap(onBus: 0)
        }, error: nil)
        isTapInstalled = false
    }

    private func tearDownEngine_locked() {
        removeTapIfNeeded_locked()
        if let engine = audioEngine {
            if engine.isRunning {
                engine.stop()
            }
            _ = ObjCExceptionCatcher.perform({
                engine.reset()
            }, error: nil)
        }
        audioEngine = nil
    }

    private func hardwareFormat(on inputNode: AVAudioInputNode) -> AVAudioFormat? {
        let candidates = [
            inputNode.outputFormat(forBus: 0),
            inputNode.inputFormat(forBus: 0),
        ]
        return candidates.first { format in
            format.sampleRate >= 8_000 && format.channelCount > 0
        }
    }

    private func waitForValidFormat(
        on inputNode: AVAudioInputNode,
        sessionID: UUID
    ) async -> AVAudioFormat? {
        for attempt in 0..<16 {
            stateLock.lock()
            let current = self.sessionID
            stateLock.unlock()
            guard current == sessionID else { return nil }
            if let format = hardwareFormat(on: inputNode) {
                return format
            }
            try? await Task.sleep(for: .milliseconds(40 + attempt * 20))
        }
        return nil
    }

    /// Must stay **nonisolated** so the tap block is not MainActor-isolated.
    /// Audio realtime threads calling a MainActor closure → `EXC_BREAKPOINT`.
    nonisolated private static func installTapNonisolated(
        on inputNode: AVAudioInputNode,
        format: AVAudioFormat,
        request: SFSpeechAudioBufferRecognitionRequest
    ) throws {
        var caught: NSError?
        let ok = ObjCExceptionCatcher.perform({
            // Closure must not capture MainActor state. `request.append` is
            // documented as safe to call from the audio tap thread.
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
        }, error: &caught)
        guard ok else {
            throw RecognizerError.engineFailedToStart(
                caught?.localizedDescription ?? "安装麦克风监听失败"
            )
        }
    }

    private func safeInputNode(of engine: AVAudioEngine) throws -> AVAudioInputNode {
        var node: AVAudioInputNode?
        var caught: NSError?
        let ok = ObjCExceptionCatcher.perform({
            node = engine.inputNode
        }, error: &caught)
        guard ok, let node else {
            throw RecognizerError.engineFailedToStart(
                caught?.localizedDescription ?? "无法访问麦克风输入节点"
            )
        }
        return node
    }

    private func emitPartial(_ text: String) {
        let handler = onPartial
        DispatchQueue.main.async { handler?(text) }
    }

    private func emitFinal(_ text: String) {
        let handler = onFinal
        DispatchQueue.main.async { handler?(text) }
    }

    private func emitError(_ error: Error) {
        let handler = onError
        DispatchQueue.main.async { handler?(error) }
    }

    private func beginRecognition(sessionID: UUID) async {
        guard let speechRecognizer = SFSpeechRecognizer(locale: OnDeviceSupportChecker.locale) else {
            emitError(RecognizerError.recognizerUnavailable)
            return
        }

        stateLock.lock()
        recognitionTask?.cancel()
        recognitionTask = nil
        tearDownEngine_locked()
        let stillCurrent = self.sessionID == sessionID
        stateLock.unlock()
        guard stillCurrent else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        if #available(iOS 16, *) {
            request.addsPunctuation = true
        }

        stateLock.lock()
        recognitionRequest = request
        let engine = AVAudioEngine()
        audioEngine = engine
        stateLock.unlock()

        try? await Task.sleep(for: .milliseconds(80))
        stateLock.lock()
        let afterSettle = self.sessionID == sessionID
        if !afterSettle, audioEngine === engine {
            recognitionRequest = nil
            tearDownEngine_locked()
        }
        stateLock.unlock()
        guard afterSettle else { return }

        let inputNode: AVAudioInputNode
        do {
            inputNode = try safeInputNode(of: engine)
        } catch {
            stateLock.lock()
            recognitionRequest = nil
            tearDownEngine_locked()
            stateLock.unlock()
            emitError(error)
            return
        }

        guard let format = await waitForValidFormat(on: inputNode, sessionID: sessionID) else {
            stateLock.lock()
            let still = self.sessionID == sessionID
            if still {
                recognitionRequest = nil
                tearDownEngine_locked()
            }
            stateLock.unlock()
            if still { emitError(RecognizerError.invalidAudioFormat) }
            return
        }

        stateLock.lock()
        let beforeTap = self.sessionID == sessionID
        if !beforeTap, audioEngine === engine {
            recognitionRequest = nil
            tearDownEngine_locked()
        }
        stateLock.unlock()
        guard beforeTap else { return }

        do {
            // Install off MainActor isolation (static nonisolated helper).
            try Self.installTapNonisolated(on: inputNode, format: format, request: request)
            stateLock.lock()
            isTapInstalled = true
            stateLock.unlock()
        } catch {
            stateLock.lock()
            recognitionRequest = nil
            tearDownEngine_locked()
            stateLock.unlock()
            emitError(error)
            return
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            stateLock.lock()
            let still = self.sessionID == sessionID
            if still {
                tearDownEngine_locked()
                recognitionRequest = nil
            }
            stateLock.unlock()
            if still {
                emitError(RecognizerError.engineFailedToStart(error.localizedDescription))
            }
            return
        }

        stateLock.lock()
        let afterStart = self.sessionID == sessionID
        if !afterStart {
            tearDownEngine_locked()
            recognitionRequest = nil
            stateLock.unlock()
            return
        }
        stateLock.unlock()

        // Capture handlers / session under lock; callback must not touch
        // MainActor-isolated `self` before hopping to main.
        let task = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            let partial = result.map { ($0.bestTranscription.formattedString, $0.isFinal) }
            let nsError = error.map { $0 as NSError }
            DispatchQueue.main.async {
                self.handleRecognitionResult(
                    sessionID: sessionID,
                    partial: partial,
                    nsError: nsError
                )
            }
        }

        stateLock.lock()
        recognitionTask = task
        _isRunning = true
        stateLock.unlock()
    }

    private func handleRecognitionResult(
        sessionID: UUID,
        partial: (text: String, isFinal: Bool)?,
        nsError: NSError?
    ) {
        // Always invoked on the main queue.
        stateLock.lock()
        let still = self.sessionID == sessionID
        stateLock.unlock()
        guard still else { return }

        if let partial {
            if partial.isFinal {
                onFinal?(partial.text)
                cleanup(expectedSession: sessionID)
                return
            }
            onPartial?(partial.text)
        }
        guard let nsError else { return }
        // 1110 = no speech detected.
        if nsError.domain == "kAFAssistantErrorDomain", nsError.code == 1110 {
            onFinal?("")
            cleanup(expectedSession: sessionID)
            return
        }
        onError?(nsError)
        cleanup(expectedSession: sessionID)
    }

    func startRecording() {
        Task {
            do {
                try await start()
            } catch {
                emitError(error)
            }
        }
    }

    func start() async throws {
        let newSession = UUID()
        stateLock.lock()
        sessionID = newSession
        _isRunning = false
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        tearDownEngine_locked()
        stateLock.unlock()

        do {
            try activateAudioSession()
        } catch {
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
        }
        try? await Task.sleep(for: .milliseconds(200))

        stateLock.lock()
        let still = sessionID == newSession
        stateLock.unlock()
        guard still else { return }

        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            throw RecognizerError.onDeviceNotSupported
        }
        await beginRecognition(sessionID: newSession)
    }

    func stopRecording() {
        stateLock.lock()
        let running = _isRunning || recognitionRequest != nil
        let request = recognitionRequest
        let engine = audioEngine
        stateLock.unlock()
        guard running else { return }
        request?.endAudio()
        if let engine, engine.isRunning {
            engine.stop()
        }
    }

    func cancel() {
        stateLock.lock()
        sessionID = UUID()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        tearDownEngine_locked()
        _isRunning = false
        stateLock.unlock()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func cleanup(expectedSession: UUID) {
        stateLock.lock()
        guard sessionID == expectedSession else {
            stateLock.unlock()
            return
        }
        guard _isRunning || recognitionRequest != nil || isTapInstalled || audioEngine != nil else {
            stateLock.unlock()
            return
        }
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        tearDownEngine_locked()
        _isRunning = false
        stateLock.unlock()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
