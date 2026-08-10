import Foundation
import AVFoundation
import Speech

/// Shared singleton for the sticky-note voice recognizer.
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
        case noResult

        var errorDescription: String? {
            switch self {
            case .onDeviceNotSupported: return "当前设备 / 系统不支持本地语音识别"
            case .engineFailedToStart(let m): return "录音启动失败：\(m)"
            case .recognizerUnavailable: return "语音识别器不可用"
            case .noResult: return "未识别到有效内容"
            }
        }
    }

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    var onPartial: ((String) -> Void)?
    var onFinal: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    private(set) var isRunning = false

    private var setupAudioSession: Bool {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            return true
        } catch {
            return false
        }
    }

    private func beginRecognition() {
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
        inputNode.removeTap(onBus: 0)
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
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
                    } else {
                        self.onPartial?(text)
                    }
                }
                if let error {
                    self.onError?(error)
                    self.cleanup()
                }
            }
        }
        isRunning = true
    }

    /// Start recording. Used by ``StickyNoteVoiceLauncher``.
    /// Errors are delivered via ``onError`` callback (non-throwing).
    func startRecording() {
        guard !isRunning else { return }
        guard setupAudioSession else {
            onError?(RecognizerError.engineFailedToStart("audio session setup failed"))
            return
        }
        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            onError?(RecognizerError.onDeviceNotSupported)
            return
        }
        beginRecognition()
    }

    /// Start recording. Throws on failure. Used by ``RecordingOverlay``.
    func start() throws {
        guard !isRunning else { return }
        guard setupAudioSession else {
            throw RecognizerError.engineFailedToStart("audio session setup failed")
        }
        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            throw RecognizerError.onDeviceNotSupported
        }
        beginRecognition()
    }

    /// Stop streaming and let the recognizer finalize. The ``onFinal`` callback
    /// is invoked when the final result arrives (usually within a few hundred ms).
    func stopRecording() {
        recognitionRequest?.endAudio()
        audioEngine.stop()
        // Defer cleanup until onFinal / onError fires — see callback.
    }

    /// Stop streaming and discard results.
    func cancel() {
        recognitionTask?.cancel()
        cleanup()
    }

    private func cleanup() {
        guard isRunning || recognitionRequest != nil else { return }
        audioEngine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        recognitionRequest = nil
        recognitionTask = nil
        isRunning = false
    }
}
