import SwiftUI

private enum StickyNoteDisplayStatus {
    case awaitingParse
    case parsing
    case parsed
    case failed
    case skipped
    case converted
}

/// One saved sticky note. Shows the title (if any), content, time + location,
/// attachments, and the AI-status chip. Tapping the status chip expands an
/// inline ``StickyNoteDraftPreview`` and a "Convert to task" button.
struct StickyNoteCard: View {
    let note: StickyNote
    let api: StickyNotesAPI
    var onEdit: (StickyNote) -> Void = { _ in }
    var onChanged: (StickyNote) -> Void = { _ in }
    var onArchived: () -> Void = {}
    var onTaskCreated: ((StickyNoteConvertResponse) -> Void)? = nil
    var onOpenTask: ((ScheduleTask) -> Void)? = nil

    @State private var isExpanded: Bool = false
    @State private var isParsing: Bool = false
    @State private var parseError: String? = nil
    @State private var showConvertSheet: Bool = false
    @State private var converting: Bool = false
    @State private var latestParse: StickyNoteAIParse? = nil
    @State private var pollingTask: Task<Void, Never>? = nil
    @State private var isShowingArchiveConfirmation: Bool = false
    @State private var defaultWorkspaceId: String = ""
    @State private var defaultProjectId: String = ""
    @State private var convertedTask: ScheduleTask? = nil
    @State private var convertedWorkspaceId: String = ""
    @State private var convertedProjectId: String = ""

    private var displayStatus: StickyNoteDisplayStatus {
        // Optimistic: show "AI 解析中" as soon as a parse is triggered,
        // even before the server returns a pending status.
        if isParsing { return .parsing }
        guard let parse = latestParse else { return .awaitingParse }
        switch parse.parseStatus {
        case .pending:
            return .parsing
        case .success:
            return parse.convertedItemId?.isEmpty == false ? .converted : .parsed
        case .failed:
            return .failed
        case .skipped:
            return .skipped
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    titleRow
                    bodyRow
                    timeRow
                    locationAndAttachmentRow
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    // Block editing while parsing or already converted.
                    if displayStatus != .parsing && displayStatus != .converted {
                        onEdit(note)
                    }
                }

                VStack(alignment: .trailing, spacing: 0) {
                    statusChip
                    Spacer(minLength: 12)
                    deleteButton
                }
                .frame(maxHeight: .infinity, alignment: .top)
            }

            if isExpanded, let parse = latestParse, displayStatus == .parsed || displayStatus == .converted {
                StickyNoteDraftPreview(
                    parse: parse,
                    workspaceId: defaultWorkspaceId,
                    projectId: defaultProjectId,
                    isConverting: converting,
                    showConvertButton: displayStatus == .parsed,
                    onConvert: { wsId, pjId in
                        Task { await convert(parse: parse, workspaceId: wsId, projectId: pjId) }
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
            if let parse = note.latestParse, parse.parseStatus == .pending {
                startPolling()
            }
        }
        .task {
            await loadDefaults()
        }
        .onDisappear {
            pollingTask?.cancel()
        }
        .onChange(of: note.latestParse) { _, newParse in
            latestParse = newParse
            if let p = newParse, p.parseStatus == .pending {
                startPolling()
            } else {
                pollingTask?.cancel()
                if newParse?.convertedItemId?.isEmpty == false {
                    isExpanded = false
                }
            }
        }
        .alert("删除便利贴？", isPresented: $isShowingArchiveConfirmation) {
            Button("删除", role: .destructive) {
                archive()
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("删除后将从当前列表移除。")
        }
    }

    // MARK: - Sections

    private var titleRow: some View {
        Group {
            if let title = note.title, !title.isEmpty {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
            } else {
                Text("未命名便利贴")
                    .font(.headline)
                    .foregroundStyle(.tertiary)
            }
        }
        .lineLimit(1)
    }

    private var bodyRow: some View {
        Group {
            if note.content.isEmpty {
                Text("无正文")
                    .foregroundStyle(.tertiary)
            } else {
                Text(note.content)
                    .foregroundStyle(.primary)
                    .lineLimit(isExpanded ? nil : 2)
                    .multilineTextAlignment(.leading)
            }
        }
        .font(.subheadline)
    }

    private var timeRow: some View {
        Label(formatTime(note.recordedAt), systemImage: "clock")
            .font(.caption2)
            .foregroundStyle(.secondary)
    }

    private var locationAndAttachmentRow: some View {
        HStack(spacing: 8) {
            locationSummary
                .lineLimit(1)
                .truncationMode(.tail)
            attachmentSummary
            Spacer(minLength: 0)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var locationSummary: some View {
        if let loc = note.location {
            Label(
                loc.name ?? String(format: "(%.3f, %.3f)", loc.lat, loc.lng),
                systemImage: "location.fill"
            )
        } else {
            Label("未记录地点", systemImage: "location")
                .foregroundStyle(.tertiary)
        }
    }

    @ViewBuilder
    private var attachmentSummary: some View {
        if note.attachments.isEmpty {
            Label("附件 0", systemImage: "paperclip")
                .foregroundStyle(.tertiary)
        } else {
            Menu {
                ForEach(note.attachments) { attachment in
                    Button {
                        openAttachment(attachment)
                    } label: {
                        Label(attachment.filename, systemImage: "paperclip")
                    }
                }
            } label: {
                Label("附件 \(note.attachments.count)", systemImage: "paperclip")
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var statusChip: some View {
        switch displayStatus {
        case .awaitingParse:
            Button {
                Task { await triggerParse() }
            } label: {
                Label("待解析", systemImage: "sparkles")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.secondary.opacity(0.12), in: Capsule())
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .disabled(isParsing)
            .accessibilityLabel("待解析，开始 AI 解析")
        case .parsing:
            HStack(spacing: 4) {
                ProgressView().controlSize(.mini)
                Text("AI 解析中")
            }
            .font(.caption2)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(TimiaTheme.primary.opacity(0.1), in: Capsule())
            .foregroundStyle(TimiaTheme.primary)
        case .parsed:
            Button {
                isExpanded.toggle()
                if !isExpanded { pollingTask?.cancel() }
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "sparkles")
                    Text("已解析")
                }
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Color.green.opacity(0.18), in: Capsule())
                .foregroundStyle(.green)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("已解析，查看解析结果")
        case .failed:
            Button {
                Task { await triggerParse() }
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("解析失败")
                }
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Color.red.opacity(0.12), in: Capsule())
                .foregroundStyle(.red)
            }
            .buttonStyle(.plain)
            .disabled(isParsing)
            .accessibilityLabel("解析失败，重试 AI 解析")
        case .skipped:
            Button {
                Task { await triggerParse() }
            } label: {
                Label("已跳过", systemImage: "minus.circle")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.secondary.opacity(0.15), in: Capsule())
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .disabled(isParsing)
            .accessibilityLabel("已跳过，重新开始 AI 解析")
        case .converted:
            Button {
                isExpanded.toggle()
            } label: {
                Label("已转为任务", systemImage: "checkmark.circle.fill")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.green.opacity(0.1), in: Capsule())
                    .foregroundStyle(.green)
            }
            .buttonStyle(.plain)
        }
    }

    private var deleteButton: some View {
        Button {
            isShowingArchiveConfirmation = true
        } label: {
            Image(systemName: "trash.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(displayStatus == .parsing ? Color.gray : Color.red)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .disabled(displayStatus == .parsing)
        .accessibilityLabel("删除便利贴")
        .accessibilityHint("需要二次确认")
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
            } else if parse.parseStatus == .success, parse.convertedItemId?.isEmpty != false {
                isExpanded = true
            } else {
                isExpanded = false
            }
            var updated = note
            updated.latestParse = parse
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
                do {
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                } catch {
                    return
                }
                if Task.isCancelled { return }
                do {
                    guard let p = try await api.latestParse(noteId: note.id) else {
                        // A transient empty response is not a terminal status.
                        continue
                    }
                    latestParse = p
                    var updated = note
                    updated.latestParse = p
                    onChanged(updated)
                    if p.parseStatus != .pending {
                        isExpanded = p.parseStatus == .success && p.convertedItemId?.isEmpty != false
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
            // Use the server response as the canonical converted state.
            latestParse = resp.parse
            onChanged(resp.stickyNote)
            isExpanded = false

            // Fetch the full task so we can open the task editor later.
            if let taskId = resp.parse.convertedItemId {
                convertedWorkspaceId = workspaceId
                convertedProjectId = projectId
                if let task = try? await api.getTask(workspaceId: workspaceId, projectId: projectId, taskId: taskId) {
                    convertedTask = task
                }
            }
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

    private func loadDefaults() async {
        do {
            let workspaces: [WorkspaceCard] = try await api.listWorkspaces()
            if let defaultWS = workspaces.first {
                defaultWorkspaceId = defaultWS.id
                let projects: [Project] = try await api.listProjects(workspaceId: defaultWS.id)
                defaultProjectId = projects.first?.id ?? ""
            }
        } catch {
            // Silently ignore — the convert button will stay disabled.
        }
    }
}
