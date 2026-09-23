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
    /// Approximate mic level 0...1 for waveform UI. Called on the main queue.
    var onLevel: ((Float) -> Void)?

    var isRunning: Bool {
        withState { _isRunning }
    }

    /// Synchronous so `NSLock.lock()` is not called from an `async` function.
    private func withState<T>(_ body: () -> T) -> T {
        stateLock.lock()
        defer { stateLock.unlock() }
        return body()
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
        _ = try? ObjCExceptionCatcher.perform {
            engine.inputNode.removeTap(onBus: 0)
        }
        isTapInstalled = false
    }

    private func tearDownEngine_locked() {
        removeTapIfNeeded_locked()
        if let engine = audioEngine {
            if engine.isRunning {
                engine.stop()
            }
            _ = try? ObjCExceptionCatcher.perform {
                engine.reset()
            }
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
            let current = withState { self.sessionID }
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
        request: SFSpeechAudioBufferRecognitionRequest,
        levelSink: (@Sendable (Float) -> Void)?
    ) throws {
        final class LevelGate: @unchecked Sendable {
            private let lock = NSLock()
            private var lastEmit: CFTimeInterval = 0
            private let sink: @Sendable (Float) -> Void
            init(_ sink: @escaping @Sendable (Float) -> Void) { self.sink = sink }
            func push(_ level: Float) {
                let now = CACurrentMediaTime()
                lock.lock()
                defer { lock.unlock() }
                guard now - lastEmit >= 0.05 else { return }
                lastEmit = now
                sink(level)
            }
        }

        let gate = levelSink.map { LevelGate($0) }
        do {
            try ObjCExceptionCatcher.perform {
                inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                    request.append(buffer)
                    if let gate {
                        gate.push(Self.rmsLevel(of: buffer))
                    }
                }
            }
        } catch {
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
        }
    }

    nonisolated private static func rmsLevel(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<frameCount {
            let sample = channel[i]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float(frameCount))
        // Mic RMS is typically tiny; boost into a usable 0...1 display range.
        return min(1, max(0, rms * 8))
    }

    private func safeInputNode(of engine: AVAudioEngine) throws -> AVAudioInputNode {
        var node: AVAudioInputNode?
        do {
            try ObjCExceptionCatcher.perform {
                node = engine.inputNode
            }
        } catch {
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
        }
        guard let node else {
            throw RecognizerError.engineFailedToStart("无法访问麦克风输入节点")
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

        let stillCurrent = withState { () -> Bool in
            recognitionTask?.cancel()
            recognitionTask = nil
            tearDownEngine_locked()
            return self.sessionID == sessionID
        }
        guard stillCurrent else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        if #available(iOS 16, *) {
            request.addsPunctuation = true
        }

        let engine = withState { () -> AVAudioEngine in
            recognitionRequest = request
            let engine = AVAudioEngine()
            audioEngine = engine
            return engine
        }

        try? await Task.sleep(for: .milliseconds(80))
        let afterSettle = withState { () -> Bool in
            let afterSettle = self.sessionID == sessionID
            if !afterSettle, audioEngine === engine {
                recognitionRequest = nil
                tearDownEngine_locked()
            }
            return afterSettle
        }
        guard afterSettle else { return }

        let inputNode: AVAudioInputNode
        do {
            inputNode = try safeInputNode(of: engine)
        } catch {
            withState {
                recognitionRequest = nil
                tearDownEngine_locked()
            }
            emitError(error)
            return
        }

        guard let format = await waitForValidFormat(on: inputNode, sessionID: sessionID) else {
            let still = withState { () -> Bool in
                let still = self.sessionID == sessionID
                if still {
                    recognitionRequest = nil
                    tearDownEngine_locked()
                }
                return still
            }
            if still { emitError(RecognizerError.invalidAudioFormat) }
            return
        }

        let beforeTap = withState { () -> Bool in
            let beforeTap = self.sessionID == sessionID
            if !beforeTap, audioEngine === engine {
                recognitionRequest = nil
                tearDownEngine_locked()
            }
            return beforeTap
        }
        guard beforeTap else { return }

        do {
            // Install off MainActor isolation (static nonisolated helper).
            let levelHandler: (@Sendable (Float) -> Void)? = { [weak self] level in
                DispatchQueue.main.async {
                    self?.onLevel?(level)
                }
            }
            try Self.installTapNonisolated(
                on: inputNode,
                format: format,
                request: request,
                levelSink: levelHandler
            )
            withState { isTapInstalled = true }
        } catch {
            withState {
                recognitionRequest = nil
                tearDownEngine_locked()
            }
            emitError(error)
            return
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            let still = withState { () -> Bool in
                let still = self.sessionID == sessionID
                if still {
                    tearDownEngine_locked()
                    recognitionRequest = nil
                }
                return still
            }
            if still {
                emitError(RecognizerError.engineFailedToStart(error.localizedDescription))
            }
            return
        }

        let afterStart = withState { () -> Bool in
            let afterStart = self.sessionID == sessionID
            if !afterStart {
                tearDownEngine_locked()
                recognitionRequest = nil
            }
            return afterStart
        }
        guard afterStart else { return }

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

        withState {
            recognitionTask = task
            _isRunning = true
        }
    }

    private func handleRecognitionResult(
        sessionID: UUID,
        partial: (text: String, isFinal: Bool)?,
        nsError: NSError?
    ) {
        // Always invoked on the main queue.
        let still = withState { self.sessionID == sessionID }
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
        withState {
            sessionID = newSession
            _isRunning = false
            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = nil
            tearDownEngine_locked()
        }

        do {
            try activateAudioSession()
        } catch {
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
        }
        try? await Task.sleep(for: .milliseconds(200))

        let still = withState { sessionID == newSession }
        guard still else { return }

        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            throw RecognizerError.onDeviceNotSupported
        }
        await beginRecognition(sessionID: newSession)
    }

    func stopRecording() {
        let snapshot = withState {
            (_isRunning || recognitionRequest != nil, recognitionRequest, audioEngine)
        }
        let (running, request, engine) = snapshot
        guard running else { return }
        request?.endAudio()
        if let engine, engine.isRunning {
            engine.stop()
        }
    }

    func cancel() {
        withState {
            sessionID = UUID()
            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = nil
            tearDownEngine_locked()
            _isRunning = false
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func cleanup(expectedSession: UUID) {
        let deactivate = withState { () -> Bool in
            guard sessionID == expectedSession else { return false }
            guard _isRunning || recognitionRequest != nil || isTapInstalled || audioEngine != nil else {
                return false
            }
            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest?.endAudio()
            recognitionRequest = nil
            tearDownEngine_locked()
            _isRunning = false
            return true
        }
        if deactivate {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
