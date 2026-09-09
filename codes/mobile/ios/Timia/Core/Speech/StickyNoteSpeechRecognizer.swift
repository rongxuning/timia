import Foundation
import AVFoundation
import Speech

/// Shared singleton for on-device Chinese speech recognition.
///
/// v1 contract:
///   * ``requiresOnDeviceRecognition == true`` — no audio leaves the device.
///   * v1 only supports Chinese (zh-CN).
///   * Audio buffers are streamed via ``SFSpeechAudioBufferRecognitionRequest``
///     and never written to disk.
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

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    /// ``removeTap(onBus:)`` crashes if no tap is installed — track it ourselves.
    private var isTapInstalled = false

    var onPartial: ((String) -> Void)?
    var onFinal: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isRunning = false

    private func activateAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    /// After mic permission is granted, ``inputNode.outputFormat`` can briefly
    /// report 0 Hz / 0 channels. Wait and re-query before installing a tap.
    private func resolvedInputFormat(for inputNode: AVAudioInputNode) async -> AVAudioFormat? {
        for attempt in 0..<8 {
            let format = inputNode.outputFormat(forBus: 0)
            if format.sampleRate > 0, format.channelCount > 0 {
                return format
            }
            if attempt == 0 {
                // Force the input node to materialize a hardware format.
                inputNode.reset()
            }
            try? await Task.sleep(for: .milliseconds(50 + attempt * 25))
        }
        return nil
    }

    private func removeTapIfNeeded(from inputNode: AVAudioInputNode) {
        guard isTapInstalled else { return }
        inputNode.removeTap(onBus: 0)
        isTapInstalled = false
    }

    private func beginRecognition() async {
        guard let recognizer = SFSpeechRecognizer(locale: OnDeviceSupportChecker.locale) else {
            onError?(RecognizerError.recognizerUnavailable)
            return
        }

        recognitionTask?.cancel()
        recognitionTask = nil

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        if #available(iOS 16, *) {
            request.addsPunctuation = true
        }
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        removeTapIfNeeded(from: inputNode)

        guard let format = await resolvedInputFormat(for: inputNode) else {
            onError?(RecognizerError.invalidAudioFormat)
            recognitionRequest = nil
            return
        }

        // Capture the request locally — the audio tap runs off the main actor.
        let streamingRequest = request
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            streamingRequest.append(buffer)
        }
        isTapInstalled = true

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            removeTapIfNeeded(from: inputNode)
            recognitionRequest = nil
            onError?(RecognizerError.engineFailedToStart(error.localizedDescription))
            return
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    let text = result.bestTranscription.formattedString
                    if result.isFinal {
                        self.onFinal?(text)
                        self.cleanup()
                        return
                    }
                    self.onPartial?(text)
                }
                guard let error else { return }
                // "No speech detected" after a clean stop is common; treat empty as final.
                let nsError = error as NSError
                let isNoSpeech = nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110
                if isNoSpeech {
                    self.onFinal?("")
                    self.cleanup()
                    return
                }
                self.onError?(error)
                self.cleanup()
            }
        }
        isRunning = true
    }

    /// Start recording. Errors are delivered via ``onError``.
    func startRecording() {
        Task { @MainActor in
            do {
                try await start()
            } catch {
                onError?(error)
            }
        }
    }

    /// Start recording. Throws on synchronous precondition failure;
    /// async audio-format resolution failures go through ``onError``.
    func start() async throws {
        guard !isRunning else { return }
        do {
            try activateAudioSession()
        } catch {
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
        }
        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            throw RecognizerError.onDeviceNotSupported
        }
        await beginRecognition()
    }

    /// Stop streaming and let the recognizer finalize. The ``onFinal`` callback
    /// is invoked when the final result arrives (usually within a few hundred ms).
    func stopRecording() {
        guard isRunning || recognitionRequest != nil else { return }
        recognitionRequest?.endAudio()
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        // Defer cleanup until onFinal / onError fires — see callback.
    }

    /// Stop streaming and discard results.
    func cancel() {
        recognitionTask?.cancel()
        cleanup()
    }

    private func cleanup() {
        guard isRunning || recognitionRequest != nil || isTapInstalled else { return }
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        removeTapIfNeeded(from: audioEngine.inputNode)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        recognitionRequest = nil
        recognitionTask = nil
        isRunning = false
    }
}
