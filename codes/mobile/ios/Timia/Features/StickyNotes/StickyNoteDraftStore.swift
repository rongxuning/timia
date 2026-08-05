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
    /// The full text the user is editing. The first line becomes the
    /// sticky-note ``title`` on save; subsequent lines become ``content``.
    @Published var combined: String = ""
    @Published var pendingAttachments: [PendingAttachment] = []
    @Published var location: StickyNoteLocationSnapshot? = nil
    @Published var isSaving: Bool = false
    @Published var lastError: String? = nil

    /// Convenience — the (title, content) split of ``combined``.
    var splitTitleContent: (title: String?, content: String) {
        let lines = combined.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        if lines.isEmpty { return (nil, "") }
        if lines.count == 1 {
            let only = String(lines[0])
            return (only.isEmpty ? nil : only, "")
        }
        let title = String(lines[0])
        let content = String(lines[1])
        return (title.isEmpty ? nil : title, content)
    }

    /// Append text recognized from voice onto the existing draft.
    func appendContent(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if combined.isEmpty {
            combined = trimmed
        } else {
            let separator: String
            if combined.hasSuffix("\n") || combined.hasSuffix(" ") || combined.hasSuffix("。")
                || combined.hasSuffix("，") || combined.hasSuffix("；") || combined.hasSuffix("、") {
                separator = ""
            } else {
                separator = " "
            }
            combined += separator + trimmed
        }
    }

    func reset() {
        combined = ""
        pendingAttachments = []
        location = nil
        isSaving = false
        lastError = nil
    }

    var canSubmit: Bool {
        !combined.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }
}
