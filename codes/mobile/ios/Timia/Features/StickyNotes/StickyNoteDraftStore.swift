import Foundation
import CoreLocation
import Combine

/// A single attachment picked by the user, before it's POSTed.
struct PendingAttachment: Identifiable, Hashable {
    let id: String
    let attachmentType: String
    let filename: String
    let mimeType: String
    let byteSize: Int
    let widthPx: Int?
    let heightPx: Int?
    let durationMs: Int?
    /// Local URL the file was copied to (or nil if the user did not actually
    /// pick a file from disk — UI-only).
    let localFileURL: URL?
}

/// Snapshot of the device's location at "save" time.
struct StickyNoteLocationSnapshot: Hashable {
    let lat: Double
    let lng: Double
    let accuracyM: Double?
    let name: String?
    let source: String
}

/// Shared draft state.
///
/// Both the sticky-note input view (top half of the page) and the voice
/// launcher (bottom toolbar) mutate this object, so they need a shared
/// instance. ``ScheduleHomeView`` owns it and passes the same instance to
/// both children.
@MainActor
final class StickyNoteDraftStore: ObservableObject {
    @Published var title: String = ""
    @Published var content: String = ""
    @Published var pendingAttachments: [PendingAttachment] = []
    @Published var location: StickyNoteLocationSnapshot? = nil
    @Published var isSaving: Bool = false
    @Published var lastError: String? = nil

    func appendContent(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if content.isEmpty {
            content = trimmed
        } else {
            let separator: String
            if content.hasSuffix("\n") || content.hasSuffix(" ") || content.hasSuffix("。")
                || content.hasSuffix("，") || content.hasSuffix("；") || content.hasSuffix("、") {
                separator = ""
            } else {
                separator = " "
            }
            content += separator + trimmed
        }
    }

    func reset() {
        title = ""
        content = ""
        pendingAttachments = []
        location = nil
        isSaving = false
        lastError = nil
    }

    var canSubmit: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }
}
