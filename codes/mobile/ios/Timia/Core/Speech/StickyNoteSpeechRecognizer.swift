import Foundation
import AVFoundation
import Speech

/// Shared on-device Chinese speech recognizer.
///
/// Hardened against tap-to-speak crashes on **real devices** (simulators usually
/// bail earlier via ``OnDeviceSupportChecker.deviceNotSupported``):
/// 1. Recreate ``AVAudioEngine`` every session.
/// 2. Match Apple's SpokenWord sample: `.record` + `.measurement`.
/// 3. Never `installTap` unless hardware format is valid; use that native format.
/// 4. Wrap `inputNode` / `installTap` / `removeTap` in ``ObjCExceptionCatcher`` —
///    those APIs raise ObjC ``NSException`` that Swift `do/catch` cannot catch.
/// 5. Session generation token invalidates in-flight async starts after `cancel()`.
@MainActor
final class StickyNoteSpeechRecognizer {
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

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isTapInstalled = false
    /// Bumped on every `start` / `cancel` so in-flight async work can bail out.
    private var sessionID = UUID()

    var onPartial: ((String) -> Void)?
    var onFinal: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isRunning = false

    private func activateAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        // Apple's "Recognizing Speech in Live Audio" sample uses `.record`,
        // not `.playAndRecord` — the latter leaves some devices on a 0 Hz
        // input route that makes `installTap` abort the process.
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try? session.setPreferredSampleRate(44_100)
        try? session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        guard session.isInputAvailable else {
            throw RecognizerError.invalidAudioFormat
        }
    }

    private func removeTapIfNeeded() {
        guard isTapInstalled, let engine = audioEngine else {
            isTapInstalled = false
            return
        }
        // removeTap itself can NSException if the graph is in a bad state.
        _ = ObjCExceptionCatcher.perform({
            engine.inputNode.removeTap(onBus: 0)
        }, error: nil)
        isTapInstalled = false
    }

    private func tearDownEngine() {
        removeTapIfNeeded()
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
        // Prefer outputFormat (what installTap consumes); fall back to inputFormat.
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
            guard self.sessionID == sessionID else { return nil }
            if let format = hardwareFormat(on: inputNode) {
                return format
            }
            try? await Task.sleep(for: .milliseconds(40 + attempt * 20))
        }
        return nil
    }

    /// Access `inputNode` under the ObjC exception shield — a cold mic route
    /// throws `com.apple.coreaudio.avfaudio` and would otherwise kill the app.
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

    private func safeInstallTap(
        on inputNode: AVAudioInputNode,
        format: AVAudioFormat,
        request: SFSpeechAudioBufferRecognitionRequest
    ) throws {
        var caught: NSError?
        let ok = ObjCExceptionCatcher.perform({
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
        }, error: &caught)
        guard ok else {
            throw RecognizerError.engineFailedToStart(
                caught?.localizedDescription ?? "安装麦克风监听失败"
            )
        }
        isTapInstalled = true
    }

    private func beginRecognition(sessionID: UUID) async {
        guard let speechRecognizer = SFSpeechRecognizer(locale: OnDeviceSupportChecker.locale) else {
            onError?(RecognizerError.recognizerUnavailable)
            return
        }

        recognitionTask?.cancel()
        recognitionTask = nil
        tearDownEngine()
        guard self.sessionID == sessionID else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        if #available(iOS 16, *) {
            request.addsPunctuation = true
        }
        recognitionRequest = request

        let engine = AVAudioEngine()
        audioEngine = engine

        // Let the session attach to hardware before touching inputNode.
        try? await Task.sleep(for: .milliseconds(80))
        guard self.sessionID == sessionID else {
            if audioEngine === engine {
                recognitionRequest = nil
                tearDownEngine()
            }
            return
        }

        let inputNode: AVAudioInputNode
        do {
            inputNode = try safeInputNode(of: engine)
        } catch {
            recognitionRequest = nil
            tearDownEngine()
            onError?(error)
            return
        }

        guard let format = await waitForValidFormat(on: inputNode, sessionID: sessionID) else {
            guard self.sessionID == sessionID else { return }
            recognitionRequest = nil
            tearDownEngine()
            onError?(RecognizerError.invalidAudioFormat)
            return
        }
        guard self.sessionID == sessionID else {
            if audioEngine === engine {
                recognitionRequest = nil
                tearDownEngine()
            }
            return
        }

        do {
            try safeInstallTap(on: inputNode, format: format, request: request)
        } catch {
            recognitionRequest = nil
            tearDownEngine()
            onError?(error)
            return
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            guard self.sessionID == sessionID else { return }
            tearDownEngine()
            recognitionRequest = nil
            onError?(RecognizerError.engineFailedToStart(error.localizedDescription))
            return
        }
        guard self.sessionID == sessionID else {
            tearDownEngine()
            recognitionRequest = nil
            return
        }

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                guard self.sessionID == sessionID else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    if result.isFinal {
                        self.onFinal?(text)
                        self.cleanup(expectedSession: sessionID)
                        return
                    }
                    self.onPartial?(text)
                }
                guard let error else { return }
                let nsError = error as NSError
                // 1110 = no speech detected; treat as empty success rather than hard fail.
                if nsError.domain == "kAFAssistantErrorDomain", nsError.code == 1110 {
                    self.onFinal?("")
                    self.cleanup(expectedSession: sessionID)
                    return
                }
                self.onError?(error)
                self.cleanup(expectedSession: sessionID)
            }
        }
        isRunning = true
    }

    func startRecording() {
        Task { @MainActor in
            do {
                try await start()
            } catch {
                onError?(error)
            }
        }
    }

    func start() async throws {
        let newSession = UUID()
        sessionID = newSession
        isRunning = false
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        tearDownEngine()

        do {
            try activateAudioSession()
        } catch {
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
        }
        // Let hardware attach after a fresh mic-permission grant.
        try? await Task.sleep(for: .milliseconds(200))
        guard sessionID == newSession else { return }

        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            throw RecognizerError.onDeviceNotSupported
        }
        await beginRecognition(sessionID: newSession)
    }

    func stopRecording() {
        guard isRunning || recognitionRequest != nil else { return }
        recognitionRequest?.endAudio()
        if let engine = audioEngine, engine.isRunning {
            engine.stop()
        }
    }

    func cancel() {
        sessionID = UUID()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        tearDownEngine()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isRunning = false
    }

    private func cleanup(expectedSession: UUID) {
        guard sessionID == expectedSession else { return }
        guard isRunning || recognitionRequest != nil || isTapInstalled || audioEngine != nil else { return }
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        tearDownEngine()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isRunning = false
    }
}
