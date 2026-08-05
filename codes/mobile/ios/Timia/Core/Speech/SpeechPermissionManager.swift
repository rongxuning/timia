import Foundation
import AVFoundation
import Speech

/// Centralized permission management for sticky-note voice input.
///
/// The first time a user taps the voice button we ask for *both* microphone
/// and speech recognition authorization. Subsequent uses just read the cached
/// status — no extra prompts.
@MainActor
final class SpeechPermissionManager: ObservableObject {
    static let shared = SpeechPermissionManager()

    @Published private(set) var microphone: AVAuthorizationStatus = .notDetermined
    @Published private(set) var recognition: SFSpeechRecognizerAuthorizationStatus = .notDetermined

    private init() {
        refresh()
    }

    func refresh() {
        microphone = AVCaptureDevice.authorizationStatus(for: .audio)
        recognition = SFSpeechRecognizer.authorizationStatus()
    }

    /// Request both permissions (idempotent; iOS will not re-prompt if user
    /// already decided). Returns the resolved ``Status`` after any prompts.
    @discardableResult
    func requestIfNeeded() async -> Status {
        if microphone == .notDetermined {
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            microphone = granted ? .authorized : .denied
        }
        if recognition == .notDetermined {
            let status = await withCheckedContinuation { (cont: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
                SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
            }
            recognition = status
        }
        return currentStatus()
    }

    func currentStatus() -> Status {
        switch (microphone, recognition) {
        case (.authorized, .authorized):
            return .authorized
        case (.denied, _), (_, .denied):
            return .denied
        case (.restricted, _), (_, .restricted):
            return .restricted
        case (.notDetermined, _), (_, .notDetermined):
            return .notDetermined
        @unknown default:
            return .notDetermined
        }
    }

    enum Status {
        case authorized
        case denied
        case restricted
        case notDetermined

        var hintText: String? {
            switch self {
            case .authorized: return nil
            case .denied: return "需要麦克风 / 语音识别权限（设置 → Timia）"
            case .restricted: return "设备已限制语音识别"
            case .notDetermined: return nil
            }
        }
    }
}
