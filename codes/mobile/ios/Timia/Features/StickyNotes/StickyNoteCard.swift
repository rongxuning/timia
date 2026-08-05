import SwiftUI

/// One saved sticky note. Shows the title (if any), content, time + location,
/// attachments, and the AI-status chip. Tapping the status chip expands an
/// inline ``StickyNoteDraftPreview`` and a "Convert to task" button.
struct StickyNoteCard: View {
    let note: StickyNote
    let api: StickyNotesAPI
    var onChanged: (StickyNote) -> Void = { _ in }
    var onArchived: () -> Void = {}
    var onTaskCreated: ((StickyNoteConvertResponse) -> Void)? = nil

    @State private var isExpanded: Bool = false
    @State private var isParsing: Bool = false
    @State private var parseError: String? = nil
    @State private var showConvertSheet: Bool = false
    @State private var converting: Bool = false
    @State private var latestParse: StickyNoteAIParse? = nil
    @State private var pollingTask: Task<Void, Never>? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            if !note.content.isEmpty {
                Text(note.content)
                    .font(.subheadline)
                    .lineLimit(isExpanded ? nil : 4)
                    .multilineTextAlignment(.leading)
            }
            metaRow
            if !note.attachments.isEmpty {
                attachmentRow
            }
            actionRow
            if isExpanded, let parse = latestParse, parse.parseStatus == .success {
                StickyNoteDraftPreview(
                    parse: parse,
                    isConverting: converting,
                    onConvert: { workspaceId, projectId in
                        Task { await convert(parse: parse, workspaceId: workspaceId, projectId: projectId) }
                    },
                    onClose: { isExpanded = false }
                )
                .padding(.top, 6)
            }
            if let err = parseError {
                Text(err)
                    .font(.caption2)
                    .foregroundStyle(.red)
            }
        }
        .padding(10)
        .background(TimiaTheme.card, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(TimiaTheme.border.opacity(0.5), lineWidth: 0.5)
        )
        .onAppear {
            latestParse = note.latestParse
        }
        .onDisappear {
            pollingTask?.cancel()
        }
        .onChange(of: note.latestParse?.id) { _, newID in
            latestParse = note.latestParse
            if let p = note.latestParse, p.parseStatus == .pending {
                startPolling()
            }
        }
    }

    // MARK: - Sections

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                if let title = note.title, !title.isEmpty {
                    Text(title)
                        .font(.headline)
                        .lineLimit(2)
                }
            }
            Spacer()
            statusChip
        }
    }

    @ViewBuilder
    private var statusChip: some View {
        switch note.latestParse?.parseStatus {
        case .none:
            Button {
                Task { await triggerParse() }
            } label: {
                Label("AI 解析", systemImage: "sparkles")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(TimiaTheme.primary.opacity(0.12), in: Capsule())
                    .foregroundStyle(TimiaTheme.primary)
            }
            .buttonStyle(.plain)
            .disabled(isParsing)
        case .pending:
            HStack(spacing: 4) {
                ProgressView().controlSize(.mini)
                Text("解析中…")
            }
            .font(.caption2)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.secondary.opacity(0.15), in: Capsule())
        case .success:
            Button {
                isExpanded.toggle()
                if !isExpanded { pollingTask?.cancel() }
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "sparkles")
                    Text("已生成草稿")
                }
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Color.green.opacity(0.18), in: Capsule())
                .foregroundStyle(.green)
            }
            .buttonStyle(.plain)
        case .failed:
            Button {
                Task { await triggerParse() }
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("重试解析")
                }
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Color.orange.opacity(0.18), in: Capsule())
                .foregroundStyle(.orange)
            }
            .buttonStyle(.plain)
            .disabled(isParsing)
        case .some(.skipped):
            EmptyView()
        }
    }

    private var metaRow: some View {
        HStack(spacing: 8) {
            Label(formatTime(note.recordedAt), systemImage: "clock")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let loc = note.location {
                Label(
                    loc.name ?? String(format: "(%.3f, %.3f)", loc.lat, loc.lng),
                    systemImage: "location.fill"
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Spacer()
        }
    }

    @ViewBuilder
    private var attachmentRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(note.attachments) { att in
                    AttachmentChip(attachment: att) {
                        openAttachment(att)
                    }
                }
            }
        }
    }

    private var actionRow: some View {
        HStack {
            if note.convertedCount > 0 {
                Text("已转化为任务 ×\(note.convertedCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                archive()
            } label: {
                Image(systemName: "trash")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("归档便利贴")
        }
    }

    // MARK: - Actions

    private func triggerParse() async {
        parseError = nil
        isParsing = true
        defer { isParsing = false }
        do {
            let parse = try await api.triggerParse(id: note.id)
            latestParse = parse
            if parse.parseStatus == .pending {
                startPolling()
            } else if parse.parseStatus == .success {
                isExpanded = true
            }
            var updated = note
            updated = StickyNote(
                id: note.id,
                ownerUserId: note.ownerUserId,
                title: note.title,
                content: note.content,
                recordedAt: note.recordedAt,
                createdAt: note.createdAt,
                timezone: note.timezone,
                location: note.location,
                deviceKind: note.deviceKind,
                archivedAt: note.archivedAt,
                convertedCount: note.convertedCount,
                attachments: note.attachments,
                latestParse: parse
            )
            onChanged(updated)
        } catch {
            parseError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task { @MainActor in
            for _ in 0..<15 {  // up to 30s, every 2s
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if Task.isCancelled { return }
                do {
                    if let p = try await api.latestUnconvertedParse(noteId: note.id) {
                        latestParse = p
                        if p.parseStatus != .pending {
                            if p.parseStatus == .success { isExpanded = true }
                            return
                        }
                    } else {
                        return
                    }
                } catch {
                    return
                }
            }
        }
    }

    private func convert(parse: StickyNoteAIParse, workspaceId: String, projectId: String) async {
        converting = true
        defer { converting = false }
        do {
            let resp = try await api.convert(
                noteId: note.id,
                payload: StickyNoteConvertPayload(
                    parseId: parse.id,
                    workspaceId: workspaceId,
                    projectId: projectId,
                    fieldOverrides: [:]
                )
            )
            onTaskCreated?(resp)
            // Optimistic: bump convertedCount on the card.
            var updated = note
            updated = StickyNote(
                id: note.id,
                ownerUserId: note.ownerUserId,
                title: note.title,
                content: note.content,
                recordedAt: note.recordedAt,
                createdAt: note.createdAt,
                timezone: note.timezone,
                location: note.location,
                deviceKind: note.deviceKind,
                archivedAt: note.archivedAt,
                convertedCount: note.convertedCount + 1,
                attachments: note.attachments,
                latestParse: resp.parse
            )
            onChanged(updated)
            isExpanded = false
        } catch {
            parseError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func archive() {
        Task {
            do {
                try await api.archive(id: note.id)
                onArchived()
            } catch {
                parseError = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    private func openAttachment(_ att: StickyNoteAttachment) {
        // v1: open the Quick Look preview for the local file.
        let url = StickyNoteLocalStore.shared.fileURL(
            noteId: note.id,
            attachmentId: att.id,
            filename: att.filename
        )
        guard FileManager.default.fileExists(atPath: url.path) else {
            parseError = "本地文件不存在"
            return
        }
        UIApplication.shared.open(url)
    }

    private func formatTime(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) ?? Date()
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm"
        return f.string(from: date)
    }
}
