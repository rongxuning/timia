import Foundation
import AVFoundation
import Speech

/// Wraps ``SFSpeechRecognizer`` for the sticky-note voice button.
///
/// v1 contract:
///   * ``requiresOnDeviceRecognition == true`` — no audio leaves the device.
///   * v1 only supports Chinese (zh-CN).
///   * Audio buffers are streamed via ``SFSpeechAudioBufferRecognitionRequest``
///     and never written to disk. After ``stop()`` the engine is torn down
///     and the audio buffer is released.
@MainActor
final class StickyNoteSpeechRecognizer {
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

    /// Begin streaming microphone audio into the recognizer.
    func start() throws {
        guard !isRunning else { return }
        let availability = OnDeviceSupportChecker.check()
        guard availability == .available else {
            throw RecognizerError.onDeviceNotSupported
        }
        guard let recognizer = SFSpeechRecognizer(locale: OnDeviceSupportChecker.locale) else {
            throw RecognizerError.recognizerUnavailable
        }

        // Cancel any prior task
        recognitionTask?.cancel()
        recognitionTask = nil

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Hard guarantee: never go to the cloud.
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
            throw RecognizerError.engineFailedToStart(error.localizedDescription)
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

    /// Stop streaming and let the recognizer finalize. The ``onFinal`` callback
    /// is invoked when the final result arrives (usually within a few hundred ms).
    func stop() {
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
