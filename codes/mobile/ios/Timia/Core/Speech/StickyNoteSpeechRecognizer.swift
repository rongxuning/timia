import Foundation
import AVFoundation
import Speech

/// Shared on-device Chinese speech recognizer.
///
/// Hardened against tap-to-speak crashes:
/// 1. Recreate ``AVAudioEngine`` every session (stale engines after mic auth crash on `inputNode`).
/// 2. Never `installTap` with a 0 Hz format; use `format: nil` after validating hardware format.
/// 3. Track tap install state — `removeTap` crashes when none is installed.
/// 4. Session generation token so a rapid `cancel()` during async start cannot
///    tear down the engine while `start()` still holds an `inputNode` reference.
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
        try session.setCategory(
            .playAndRecord,
            mode: .measurement,
            options: [.duckOthers, .defaultToSpeaker]
        )
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func removeTapIfNeeded() {
        guard isTapInstalled, let engine = audioEngine else {
            isTapInstalled = false
            return
        }
        engine.inputNode.removeTap(onBus: 0)
        isTapInstalled = false
    }

    private func tearDownEngine() {
        removeTapIfNeeded()
        if let engine = audioEngine, engine.isRunning {
            engine.stop()
        }
        audioEngine = nil
    }

    private func waitForValidFormat(
        on inputNode: AVAudioInputNode,
        sessionID: UUID
    ) async -> AVAudioFormat? {
        for attempt in 0..<12 {
            guard self.sessionID == sessionID else { return nil }
            let format = inputNode.outputFormat(forBus: 0)
            if format.sampleRate >= 8_000, format.channelCount > 0 {
                return format
            }
            try? await Task.sleep(for: .milliseconds(40 + attempt * 20))
        }
        return nil
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
        let inputNode = engine.inputNode

        guard await waitForValidFormat(on: inputNode, sessionID: sessionID) != nil else {
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

        // `format: nil` → node's native format (avoids installTap NSException).
        let streamingRequest = request
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { buffer, _ in
            streamingRequest.append(buffer)
        }
        isTapInstalled = true

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
        try? await Task.sleep(for: .milliseconds(150))
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
