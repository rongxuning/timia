import SwiftUI
import CoreLocation
import UIKit

/// Top-level sticky-note view. The default content is the saved-card list;
/// the editor is presented as a separate sheet from the bottom toolbar.
/// Voice-recognized text lands in the same input box via the shared
/// ``StickyNoteDraftStore``.
struct StickyNoteView: View {
    let session: AppSession
    @ObservedObject var draft: StickyNoteDraftStore
    @Binding var isEditorPresented: Bool
    var onTaskCreated: ((StickyNoteConvertResponse) -> Void)? = nil

    @StateObject private var model = StickyNoteListModel()
    @State private var locationManager = StickyNoteLocationManager()
    @State private var showingPicker = false
    @State private var locationError: String? = nil
    @State private var editingNoteID: String? = nil
    @State private var taskToOpen: ScheduleTask? = nil

    private var api: StickyNotesAPI { StickyNotesAPI(client: session.api) }

    var body: some View {
        StickyNoteListView(
            model: model,
            api: api,
            onEdit: beginEditing,
            onTaskCreated: onTaskCreated,
            onOpenTask: { task in taskToOpen = task }
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        .sheet(isPresented: $isEditorPresented, onDismiss: resetEditorState) {
            NavigationStack {
                StickyNoteInputView(
                    draft: draft,
                    locationError: $locationError,
                    isEditMode: editingNoteID != nil,
                    onPickAttachments: { showingPicker = true },
                    onRequestLocation: { Task { await requestLocation() } },
                    onClearLocation: {
                        draft.location = nil
                        locationError = nil
                    },
                    onSave: { Task { await save() } },
                    onCancel: { isEditorPresented = false },
                    onUpdate: { Task { await update() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(TimiaTheme.surface)
                .navigationTitle(editingNoteID == nil ? "新建便利贴" : "编辑便利贴")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("取消") {
                            isEditorPresented = false
                        }
                    }
                }
            }
            .presentationDetents([.large])
        }
        .sheet(item: $taskToOpen) { task in
            NavigationStack {
                TaskEditorView(mode: .edit(task)) {
                    taskToOpen = nil
                    Task { await model.refresh(api: api) }
                }
            }
        }
    }

    // MARK: - Update (edit mode)

    private func update() async {
        guard draft.canSubmit, let editingNoteID else { return }
        draft.isSaving = true

        let (title, content) = draft.splitTitleContent
        let finalContent: String
        if !content.isEmpty {
            finalContent = content
        } else if title == nil {
            finalContent = ""
        } else {
            finalContent = title ?? ""
        }

        // Close sheet immediately so the card can transition to parsing state.
        draft.reset()
        dismissKeyboard()
        isEditorPresented = false

        // Mark as pending parse in the model immediately.
        if let note = model.notes.first(where: { $0.id == editingNoteID }) {
            var updated = note
            updated.latestParse = StickyNoteAIParse(
                id: UUID().uuidString,
                stickyNoteId: editingNoteID,
                parseStatus: .pending,
                parseProvider: nil,
                parseLatencyMs: nil,
                draft: nil,
                confidence: nil,
                assumptions: [],
                missingFields: [],
                ambiguities: [],
                convertedItemId: nil,
                convertedAt: nil,
                errorCode: nil,
                errorMessage: nil,
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
            model.replace(updated)
        }
        draft.isSaving = false

        do {
            let updated = try await api.update(
                id: editingNoteID,
                payload: StickyNoteUpdatePayload(
                    title: title,
                    content: finalContent,
                    locationName: draft.location?.name
                )
            )
            model.replace(updated)
            let parse = try await api.triggerParse(id: editingNoteID)
            await pollParse(noteId: editingNoteID, initialParse: parse)
        } catch {
            // Silent — the card will stay in whatever parse state it had.
        }
    }

    private func pollParse(noteId: String, initialParse: StickyNoteAIParse) async {
        for _ in 0..<15 {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard let p = try? await api.latestParse(noteId: noteId) else { continue }
            if p.parseStatus != .pending {
                if let note = model.notes.first(where: { $0.id == noteId }) {
                    var updated = note
                    updated.latestParse = p
                    model.replace(updated)
                }
                return
            }
        }
        await model.refresh(api: api)
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
            if let editingNoteID {
                let updated = try await api.update(
                    id: editingNoteID,
                    payload: StickyNoteUpdatePayload(
                        title: title,
                        content: finalContent,
                        locationName: draft.location?.name
                    )
                )
                model.replace(updated)
            } else {
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
            }
            draft.reset()
            dismissKeyboard()
            isEditorPresented = false
        } catch {
            draft.lastError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }

    private func resetEditorState() {
        dismissKeyboard()
        draft.reset()
        locationError = nil
        editingNoteID = nil
    }

    private func beginEditing(_ note: StickyNote) {
        editingNoteID = note.id
        let title = note.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let content = note.content.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.combined = [title, content]
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
        draft.pendingAttachments = []
        draft.location = note.location.map {
            StickyNoteLocationSnapshot(
                lat: $0.lat,
                lng: $0.lng,
                accuracyM: $0.accuracyM,
                name: $0.name,
                source: $0.source ?? "manual"
            )
        }
        draft.lastError = nil
        locationError = nil
        isEditorPresented = true
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
