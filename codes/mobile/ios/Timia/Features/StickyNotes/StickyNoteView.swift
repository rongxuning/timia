import SwiftUI
import CoreLocation

/// Top-level sticky-note view: a VStack split into an input form (top) and
/// a list of saved notes (bottom). Both the form and the bottom toolbar's
/// voice button share the same ``StickyNoteDraftStore`` so voice-recognized
/// text lands in the same input box.
struct StickyNoteView: View {
    let session: AppSession
    @ObservedObject var draft: StickyNoteDraftStore
    var onTaskCreated: ((StickyNoteConvertResponse) -> Void)? = nil

    @StateObject private var model = StickyNoteListModel()
    @State private var locationManager = StickyNoteLocationManager()
    @State private var showingPicker = false
    @State private var locationError: String? = nil

    private var api: StickyNotesAPI { StickyNotesAPI(client: session.api) }

    var body: some View {
        VStack(spacing: 0) {
            StickyNoteInputView(
                draft: draft,
                locationError: $locationError,
                onPickAttachments: { showingPicker = true },
                onRequestLocation: { Task { await requestLocation() } },
                onClearLocation: {
                    draft.location = nil
                    locationError = nil
                },
                onSave: { Task { await save() } }
            )
            .frame(maxWidth: .infinity, alignment: .top)
            .background(TimiaTheme.surface)

            Divider()

            StickyNoteListView(
                model: model,
                api: api,
                onTaskCreated: onTaskCreated
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task {
            await model.refresh(api: api)
        }
        .fileImporter(
            isPresented: $showingPicker,
            allowedContentTypes: [.image, .movie, .audio, .pdf, .data],
            allowsMultipleSelection: true
        ) { result in
            handleFileImport(result)
        }
    }

    // MARK: - Save

    private func save() async {
        guard draft.canSubmit else { return }
        draft.isSaving = true
        defer { draft.isSaving = false }

        let (title, content) = draft.splitTitleContent
        let finalContent: String
        if !content.isEmpty {
            finalContent = content
        } else if title == nil {
            finalContent = ""
        } else {
            // User typed only a title with no body — store it as the body
            // so the API contract is satisfied (content is required).
            finalContent = title ?? ""
        }

        let payload = StickyNoteCreatePayload(
            title: title,
            content: finalContent,
            recordedAt: nil,
            timezone: TimeZone.current.identifier,
            location: draft.location.map {
                StickyNoteLocationInput(
                    lat: $0.lat,
                    lng: $0.lng,
                    accuracyM: $0.accuracyM,
                    name: $0.name,
                    source: $0.source
                )
            },
            attachments: draft.pendingAttachments.map { p in
                StickyNoteAttachmentInput(
                    attachmentType: p.attachmentType,
                    filename: p.filename,
                    mimeType: p.mimeType,
                    byteSize: p.byteSize,
                    widthPx: p.widthPx,
                    heightPx: p.heightPx,
                    durationMs: p.durationMs
                )
            },
            autoParse: false
        )

        do {
            let note = try await api.create(payload)
            // Persist local files (v1: server holds metadata only).
            for pending in draft.pendingAttachments {
                if let local = pending.localFileURL {
                    _ = try? StickyNoteLocalStore.shared.ingest(
                        source: local,
                        noteId: note.id,
                        attachmentId: pending.id
                    )
                }
            }
            // Invalidate list cache so the new note shows at the top.
            await model.refresh(api: api)
            draft.reset()
        } catch {
            draft.lastError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                let didStart = url.startAccessingSecurityScopedResource()
                defer { if didStart { url.stopAccessingSecurityScopedResource() } }
                let pending = PendingAttachment(
                    id: UUID().uuidString,
                    attachmentType: attachmentType(for: url),
                    filename: url.lastPathComponent,
                    mimeType: mimeType(for: url),
                    byteSize: (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0,
                    widthPx: nil,
                    heightPx: nil,
                    durationMs: nil,
                    localFileURL: url
                )
                draft.pendingAttachments.append(pending)
            }
        case .failure(let err):
            draft.lastError = err.localizedDescription
        }
    }

    private func attachmentType(for url: URL) -> String {
        let m = mimeType(for: url)
        if m.hasPrefix("image/") { return "image" }
        if m.hasPrefix("audio/") { return "audio" }
        if m.hasPrefix("video/") { return "video" }
        if m.hasPrefix("text/") { return "text" }
        return "file"
    }

    private func mimeType(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "heic", "heif": return "image/heic"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "m4a", "mp3", "aac", "wav": return "audio/\(ext == "m4a" ? "mp4" : ext)"
        case "mp4", "mov": return "video/mp4"
        case "pdf": return "application/pdf"
        case "txt", "md": return "text/plain"
        default: return "application/octet-stream"
        }
    }

    // MARK: - Location

    private func requestLocation() async {
        locationError = nil
        do {
            let snapshot = try await locationManager.requestCurrent()
            draft.location = snapshot
        } catch {
            locationError = error.localizedDescription
        }
    }
}
