import SwiftUI

private struct TaskChoiceOption: Identifiable {
    let id: String
    let label: String
    let color: Color
}

private let taskPriorityOptions = [
    TaskChoiceOption(id: "1", label: "低", color: Color(hex: "#3B82F6")),
    TaskChoiceOption(id: "2", label: "中", color: Color(hex: "#22C55E")),
    TaskChoiceOption(id: "3", label: "高", color: Color(hex: "#EAB308")),
    TaskChoiceOption(id: "4", label: "紧急", color: Color(hex: "#EF4444"))
]

private let taskStatusOptions = [
    TaskChoiceOption(id: "todo", label: "待办", color: TaskStatusPalette.todo),
    TaskChoiceOption(id: "doing", label: "进行中", color: TaskStatusPalette.doing),
    TaskChoiceOption(id: "done", label: "已完成", color: TaskStatusPalette.done),
    TaskChoiceOption(id: "archived", label: "已归档", color: TaskStatusPalette.archived)
]

private enum TaskEditorFocusField: Hashable {
    case title
    case body
    case location
    case comment
}

struct TaskEditorView: View {
    enum Mode: Equatable {
        case create
        case createOn(Date)
        case createAt(Date)
        case createIn(workspaceId: String, projectId: String)
        case naturalLanguage(NaturalLanguageParseResponse)
        case fromStickyNote(parse: StickyNoteAIParse, workspaceId: String, projectId: String)
        case edit(ScheduleTask)
    }

    let mode: Mode
    let onSaved: () -> Void

    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var workspaces: [WorkspaceCard] = []
    @State private var projects: [Project] = []
    @State private var memberOptions: [AssignableUser] = []
    @State private var workspaceId = ""
    @State private var projectId = ""
    @State private var assigneeUserId = ""
    @State private var participantUserIds: Set<String> = []
    @State private var title = ""
    @State private var bodyText = ""
    @State private var details = ""
    @State private var location = ""
    @State private var color = "#FFFFFF"
    @State private var status = "todo"
    @State private var priority = "1"
    @State private var startDate = Date()
    @State private var endDate = Date().addingTimeInterval(3600)
    @State private var completedDate = Date()
    @State private var comments: [TaskComment] = []
    @State private var newComment = ""
    @State private var version = 1
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var isShowingDeleteConfirmation = false
    @State private var isPrepared = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: TaskEditorFocusField?

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var naturalLanguageResponse: NaturalLanguageParseResponse? {
        if case let .naturalLanguage(response) = mode { return response }
        return nil
    }

    private var stickyNoteParse: StickyNoteAIParse? {
        if case let .fromStickyNote(parse, _, _) = mode { return parse }
        return nil
    }

    var body: some View {
        Form {
            LabeledContent("空间") {
                Picker("工作空间", selection: $workspaceId) {
                    Text("请选择").tag("")
                    ForEach(workspaces) { Text($0.name).tag($0.id) }
                }
                .labelsHidden()
                .disabled(isFixedCreate)
                .onChange(of: workspaceId) { oldValue, newValue in
                    guard oldValue != newValue else { return }
                    focusedField = nil
                    if isPrepared {
                        projectId = ""
                        memberOptions = []
                        assigneeUserId = ""
                        participantUserIds = []
                    }
                    Task { await loadProjects() }
                }
            }

            LabeledContent("项目") {
                Picker("项目", selection: $projectId) {
                    Text("请选择").tag("")
                    ForEach(projects) { Text($0.name).tag($0.id) }
                }
                .labelsHidden()
                .disabled(isFixedCreate)
                .onChange(of: projectId) { oldValue, newValue in
                    guard oldValue != newValue else { return }
                    focusedField = nil
                    if isPrepared {
                        memberOptions = []
                        assigneeUserId = ""
                        participantUserIds = []
                    }
                    Task { await loadMemberOptions() }
                }
            }

            NavigationLink {
                TaskAssigneeSelectionView(
                    users: memberOptions,
                    selection: $assigneeUserId
                )
            } label: {
                LabeledContent("负责人") {
                    Text(assigneeDisplayName)
                        .foregroundStyle(assigneeUserId.isEmpty ? .secondary : .primary)
                        .lineLimit(1)
                }
            }
            .disabled(projectId.isEmpty)

            NavigationLink {
                TaskParticipantsSelectionView(
                    users: memberOptions.filter { $0.userId != assigneeUserId },
                    selection: $participantUserIds
                )
            } label: {
                LabeledContent("成员") {
                    Text(participantDisplayText)
                        .foregroundStyle(participantUserIds.isEmpty ? .secondary : .primary)
                        .lineLimit(1)
                }
            }
            .disabled(projectId.isEmpty)
            .onChange(of: assigneeUserId) { _, newValue in
                participantUserIds.remove(newValue)
            }

            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("标题")
                    .fixedSize()
                    .frame(width: 40, alignment: .leading)
                TextField("请输入标题", text: $title)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .focused($focusedField, equals: .title)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .body }
            }

            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("正文")
                    .fixedSize()
                    .frame(width: 40, alignment: .leading)
                TextField("请输入正文", text: $bodyText, axis: .vertical)
                    .lineLimit(2...8)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
                    .focused($focusedField, equals: .body)
            }

            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("地点")
                    .fixedSize()
                    .frame(width: 40, alignment: .leading)
                TextField("请输入地点", text: $location)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .focused($focusedField, equals: .location)
                    .submitLabel(.done)
                    .onSubmit { focusedField = nil }
            }

            TaskChoiceRow(
                title: "优先级",
                selection: $priority,
                options: taskPriorityOptions,
                onSelection: { focusedField = nil }
            )
            TaskChoiceRow(
                title: "状态",
                selection: $status,
                options: taskStatusOptions,
                onSelection: { focusedField = nil }
            )

            ColorPicker("任务颜色", selection: Binding(
                get: { Color(hex: color) },
                set: {
                    focusedField = nil
                    color = $0.hexString ?? "#FFFFFF"
                }
            ))

            VStack(alignment: .leading, spacing: 12) {
                DatePicker(
                    "开始时间",
                    selection: $startDate,
                    displayedComponents: [.date, .hourAndMinute]
                )
                DatePicker(
                    "结束时间",
                    selection: $endDate,
                    in: startDate...,
                    displayedComponents: [.date, .hourAndMinute]
                )
                if status == "done" {
                    DatePicker(
                        "完成时间",
                        selection: $completedDate,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }
            }
            .onChange(of: startDate) { oldValue, newValue in
                focusedField = nil
                guard endDate <= newValue else { return }
                let previousDuration = max(3_600, endDate.timeIntervalSince(oldValue))
                endDate = newValue.addingTimeInterval(previousDuration)
            }
            .onChange(of: status) { oldValue, newValue in
                focusedField = nil
                if isPrepared, newValue == "done", oldValue != "done" {
                    completedDate = Date()
                }
            }
            .onChange(of: endDate) { _, _ in focusedField = nil }
            .onChange(of: completedDate) { _, _ in focusedField = nil }

            if let response = naturalLanguageResponse {
                Section("置信度") {
                    LabeledContent("解析置信度") {
                        Text("\(Int((response.confidence * 100).rounded()))%")
                            .fontWeight(.semibold)
                            .foregroundStyle(TimiaTheme.primary)
                    }
                    .accessibilityIdentifier("natural-language-confidence")
                }

                Section("请确认") {
                    let confirmations = naturalLanguageConfirmations(for: response)
                    if confirmations.isEmpty {
                        Label("未发现需要额外确认的内容", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(confirmations.enumerated()), id: \.offset) { _, message in
                            Label(message, systemImage: "exclamationmark.bubble")
                                .font(.subheadline)
                        }
                    }
                }
                .accessibilityIdentifier("natural-language-confirmations")
            }

            // Show AI parse context for sticky note conversion.
            if let parse = stickyNoteParse {
                parseInfoSection(parse)
            }

            if isEditing {
                ForEach(comments) { comment in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(comment.authorDisplayName).font(.subheadline.bold()); Spacer(); Text(comment.createdAtLabel).font(.caption).foregroundStyle(.secondary) }
                        Text(comment.body)
                    }
                }
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("评论")
                            .fixedSize()

                        Button {
                            focusedField = nil
                            Task { await sendComment() }
                        } label: {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 14, weight: .bold))
                                .frame(width: 36, height: 36)
                        }
                        .buttonStyle(TaskCommentSendButtonStyle(tint: TimiaTheme.primary))
                        .disabled(newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel("发送评论")
                    }
                    .frame(width: 40, alignment: .leading)

                    TextField("添加评论", text: $newComment, axis: .vertical)
                        .lineLimit(2...4)
                        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
                        .focused($focusedField, equals: .comment)
                }
            }

            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }

            if isEditing {
                Button {
                    focusedField = nil
                    isShowingDeleteConfirmation = true
                } label: {
                    HStack(spacing: 8) {
                        if isDeleting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "trash.fill")
                        }
                        Text(isDeleting ? "删除中…" : "删除任务")
                            .fontWeight(.bold)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color.red, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .disabled(isSaving || isDeleting)
                .accessibilityLabel(isDeleting ? "正在删除任务" : "删除任务")
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 8, trailing: 0))
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("取消") {
                    focusedField = nil
                    dismiss()
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "保存中…" : "保存") {
                    focusedField = nil
                    Task { await save() }
                }
                    .disabled(
                        isSaving
                            || isDeleting
                            || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || workspaceId.isEmpty
                            || projectId.isEmpty
                            || endDate <= startDate
                    )
            }
        }
        .keyboardDoneToolbar { focusedField = nil }
        .task { await prepare() }
        .onDisappear { focusedField = nil }
        .alert("确认删除任务？", isPresented: $isShowingDeleteConfirmation) {
            Button("取消", role: .cancel) {}
            Button("删除任务", role: .destructive) {
                Task { await deleteTask() }
            }
        } message: {
            Text("删除后无法恢复，请确认是否继续。")
        }
    }

    private var isFixedCreate: Bool {
        if case .createIn = mode { return true }
        return false
    }

    private var assigneeDisplayName: String {
        guard !assigneeUserId.isEmpty else { return "请选择" }
        return memberOptions.first(where: { $0.userId == assigneeUserId })?.displayName
            ?? String(assigneeUserId.prefix(8))
    }

    private var participantDisplayText: String {
        guard !participantUserIds.isEmpty else { return "请选择" }
        let names = memberOptions
            .filter { participantUserIds.contains($0.userId) }
            .map(\.displayName)
        if names.count == participantUserIds.count, names.count <= 2 {
            return names.joined(separator: "、")
        }
        return "已选择 \(participantUserIds.count) 人"
    }

    private func prepare() async {
        defer { isPrepared = true }
        switch mode {
        case .create:
            await loadWorkspaces()
        case let .createOn(date):
            let calendar = Calendar.current
            let day = calendar.startOfDay(for: date)
            startDate = calendar.date(byAdding: .hour, value: 9, to: day) ?? day
            endDate = calendar.date(byAdding: .hour, value: 1, to: startDate)
                ?? startDate.addingTimeInterval(3_600)
            await loadWorkspaces()
        case let .createAt(date):
            startDate = date
            endDate = Calendar.current.date(byAdding: .hour, value: 1, to: date)
                ?? date.addingTimeInterval(3_600)
            await loadWorkspaces()
        case let .createIn(fixedWorkspaceId, fixedProjectId):
            workspaceId = fixedWorkspaceId
            projectId = fixedProjectId
            await loadWorkspaces()
            await loadProjects()
        case let .naturalLanguage(response):
            await prepareNaturalLanguage(response)
        case let .fromStickyNote(parse, wsId, pjId):
            workspaceId = wsId
            projectId = pjId
            if let draft = parse.draft {
                await prepareNaturalLanguage(NaturalLanguageParseResponse(
                    draft: draft,
                    confidence: parse.confidence ?? 0.8,
                    assumptions: parse.assumptions,
                    missingFields: parse.missingFields,
                    ambiguities: parse.ambiguities
                ))
            }
            await loadWorkspaces()
            await loadProjects()
        case let .edit(task):
            workspaceId = task.workspaceId
            projectId = task.projectId
            fill(task)
            await loadWorkspaces()
            await loadProjects()
            await loadDetail(taskId: task.id)
        }
    }

    private func fill(_ task: ScheduleTask) {
        title = task.title; bodyText = task.body ?? ""; details = task.details ?? ""; location = task.location ?? ""
        color = task.color; status = task.status; priority = task.priority ?? "1"; version = task.version
        assigneeUserId = task.assignee?.id ?? task.createdBy?.id ?? ""
        participantUserIds = Set((task.participants ?? []).map(\.id))
        mergeMemberBriefs([task.assignee, task.createdBy].compactMap { $0 } + (task.participants ?? []))
        if let date = Self.parse(task.startAt) { startDate = date }
        if let date = Self.parse(task.endAt) { endDate = date }
        if let date = Self.parse(task.completedAt) { completedDate = date }
    }

    private func prepareNaturalLanguage(_ response: NaturalLanguageParseResponse) async {
        let draft = response.draft
        title = draft.title
        bodyText = draft.body ?? ""
        location = draft.location ?? ""
        status = draft.status
        priority = draft.priority
        if let recurrence = draft.recurrenceText?.trimmingCharacters(in: .whitespacesAndNewlines),
           !recurrence.isEmpty {
            details = "重复：\(recurrence)"
        }

        if let parsedStart = Self.parse(draft.startAt) {
            startDate = parsedStart
        }
        if let parsedEnd = Self.parse(draft.endAt) {
            endDate = parsedEnd
        } else {
            endDate = startDate.addingTimeInterval(3_600)
        }
        if endDate <= startDate {
            endDate = startDate.addingTimeInterval(3_600)
        }

        await loadWorkspaces()

        if let workspaceName = draft.workspaceName,
           let matchedWorkspace = workspaces.first(where: { namesMatch($0.name, workspaceName) }),
           workspaceId != matchedWorkspace.id {
            projectId = ""
            memberOptions = []
            assigneeUserId = ""
            participantUserIds = []
            workspaceId = matchedWorkspace.id
            await loadProjects()
        }

        if let projectName = draft.projectName,
           let matchedProject = projects.first(where: { namesMatch($0.name, projectName) }),
           projectId != matchedProject.id {
            memberOptions = []
            assigneeUserId = ""
            participantUserIds = []
            projectId = matchedProject.id
            await loadMemberOptions()
        }

        applyNaturalLanguagePeople(draft)
    }

    // MARK: - Sticky note parse info section

    @ViewBuilder
    private func parseInfoSection(_ parse: StickyNoteAIParse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !parse.assumptions.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("模型假设").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(parse.assumptions, id: \.self) { a in
                        Text("· \(a)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            if !parse.missingFields.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("缺失信息").font(.caption.weight(.semibold)).foregroundStyle(.orange)
                    ForEach(parse.missingFields, id: \.self) { m in
                        Text("· \(m)").font(.caption2).foregroundStyle(.orange)
                    }
                }
            }
            if !parse.ambiguities.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("歧义").font(.caption.weight(.semibold)).foregroundStyle(.orange)
                    ForEach(parse.ambiguities, id: \.self) { a in
                        Text("· \(a)").font(.caption2).foregroundStyle(.orange)
                    }
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 8))
    }

    private func applyNaturalLanguagePeople(_ draft: NaturalLanguageTaskDraft) {
        if let assigneeName = draft.assigneeName,
           let assignee = memberOptions.first(where: {
               namesMatch($0.displayName, assigneeName) || namesMatch($0.email, assigneeName)
           }) {
            assigneeUserId = assignee.userId
        }

        let participantNames = draft.participantNames
        if !participantNames.isEmpty {
            participantUserIds = Set(memberOptions.compactMap { member in
                participantNames.contains(where: {
                    namesMatch(member.displayName, $0) || namesMatch(member.email, $0)
                }) ? member.userId : nil
            })
            participantUserIds.remove(assigneeUserId)
        }
    }

    private func namesMatch(_ left: String, _ right: String) -> Bool {
        left.trimmingCharacters(in: .whitespacesAndNewlines)
            .localizedCaseInsensitiveCompare(
                right.trimmingCharacters(in: .whitespacesAndNewlines)
            ) == .orderedSame
    }

    private func loadWorkspaces() async {
        do {
            workspaces = try await session.api.request("/workspaces/cards", response: [WorkspaceCard].self)
            if workspaceId.isEmpty, let first = workspaces.first { workspaceId = first.id; await loadProjects() }
        } catch { errorMessage = error.localizedDescription }
    }

    private func loadProjects() async {
        guard !workspaceId.isEmpty else {
            projects = []
            projectId = ""
            memberOptions = []
            return
        }
        do {
            projects = try await session.api.request("/workspaces/\(workspaceId)/projects", response: [Project].self)
            if !projects.contains(where: { $0.id == projectId }) { projectId = projects.first?.id ?? "" }
            await loadMemberOptions()
        } catch { errorMessage = error.localizedDescription }
    }

    private func loadMemberOptions() async {
        guard !workspaceId.isEmpty, !projectId.isEmpty else {
            memberOptions = []
            return
        }
        let requestedWorkspaceId = workspaceId
        let requestedProjectId = projectId
        do {
            let context = try await session.api.request(
                "/views/workspace/\(requestedWorkspaceId)/projects/\(requestedProjectId)/task-drawer-context",
                response: TaskDrawerContext.self
            )
            guard workspaceId == requestedWorkspaceId, projectId == requestedProjectId else { return }
            let selectedIds = participantUserIds.union([assigneeUserId])
            let selectedFallbacks = memberOptions.filter { selectedIds.contains($0.userId) }
            let currentUser = AssignableUser(
                userId: context.currentUserId,
                email: "",
                displayName: context.currentUserDisplayName
            )
            let contextOptions = mergeMemberOptions(context.memberOptions, preserving: [currentUser])
            memberOptions = mergeMemberOptions(contextOptions, preserving: selectedFallbacks)
            if assigneeUserId.isEmpty,
               memberOptions.contains(where: { $0.userId == context.currentUserId }) {
                assigneeUserId = context.currentUserId
            }
            let validIds = Set(memberOptions.map(\.userId))
            participantUserIds = participantUserIds.intersection(validIds)
        } catch {
            guard workspaceId == requestedWorkspaceId, projectId == requestedProjectId else { return }
            errorMessage = error.localizedDescription
        }
    }

    private func loadDetail(taskId: String, commentsOnly: Bool = false) async {
        let sourceWorkspaceId: String
        let sourceProjectId: String
        if case let .edit(task) = mode {
            sourceWorkspaceId = task.workspaceId
            sourceProjectId = task.projectId
        } else {
            sourceWorkspaceId = workspaceId
            sourceProjectId = projectId
        }
        do {
            let detail = try await session.api.request(
                "/views/workspace/\(sourceWorkspaceId)/projects/\(sourceProjectId)/items/\(taskId)/detail",
                response: ItemDetail.self
            )
            if commentsOnly {
                comments = detail.comments ?? []
                return
            }
            title = detail.title; bodyText = detail.body ?? ""; details = detail.details ?? ""; location = detail.location ?? ""
            color = detail.color; status = detail.status; priority = detail.priority ?? "1"; version = detail.version; comments = detail.comments ?? []
            if let date = Self.parse(detail.startAt) { startDate = date }
            if let date = Self.parse(detail.endAt) { endDate = date }
            if let date = Self.parse(detail.completedAt) { completedDate = date }
            assigneeUserId = detail.assignee?.id ?? detail.createdBy?.id ?? ""
            participantUserIds = Set((detail.participants ?? []).map(\.id))
            mergeMemberBriefs([detail.assignee, detail.createdBy].compactMap { $0 } + (detail.participants ?? []))
        } catch { errorMessage = error.localizedDescription }
    }

    private func save() async {
        isSaving = true; errorMessage = nil
        do {
            switch mode {
            case .create, .createOn, .createAt, .createIn, .naturalLanguage, .fromStickyNote:
                _ = try await session.api.request(
                    "/workspaces/\(workspaceId)/projects/\(projectId)/items", method: "POST", body: payload(), response: ItemResponse.self
                )
            case let .edit(task):
                let ownershipChanged = workspaceId != task.workspaceId || projectId != task.projectId
                let update = ItemUpdatePayload(
                    version: version, title: title.trimmingCharacters(in: .whitespacesAndNewlines), body: bodyText.nilIfBlank,
                    color: color.uppercased(), status: status, priority: priority,
                    startAt: Self.format(startDate), endAt: Self.format(endDate),
                    completedAt: status == "done" ? Self.format(completedDate) : nil,
                    details: details.nilIfBlank,
                    assigneeUserId: assigneeUserId.nilIfBlank,
                    participantUserIds: Array(participantUserIds).sorted(),
                    location: location.nilIfBlank,
                    targetWorkspaceId: ownershipChanged ? workspaceId : nil,
                    targetProjectId: ownershipChanged ? projectId : nil
                )
                _ = try await session.api.request(
                    "/workspaces/\(task.workspaceId)/projects/\(task.projectId)/items/\(task.id)",
                    method: "PATCH",
                    body: update,
                    response: ItemResponse.self
                )
            }
            onSaved(); dismiss()
        } catch { errorMessage = error.localizedDescription }
        isSaving = false
    }

    private func payload() -> ItemPayload {
        ItemPayload(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines), body: bodyText.nilIfBlank, color: color.uppercased(),
            status: status, priority: priority, startAt: Self.format(startDate),
            endAt: Self.format(endDate),
            completedAt: status == "done" ? Self.format(completedDate) : nil,
            details: details.nilIfBlank,
            assigneeUserId: assigneeUserId.nilIfBlank,
            participantUserIds: Array(participantUserIds).sorted(),
            location: location.nilIfBlank
        )
    }

    private func mergeMemberBriefs(_ briefs: [UserBrief]) {
        let fallbackOptions = briefs.map {
            AssignableUser(userId: $0.id, email: "", displayName: $0.displayName)
        }
        memberOptions = mergeMemberOptions(memberOptions, preserving: fallbackOptions)
    }

    private func mergeMemberOptions(
        _ primary: [AssignableUser],
        preserving fallback: [AssignableUser]
    ) -> [AssignableUser] {
        var byId: [String: AssignableUser] = [:]
        for option in fallback { byId[option.userId] = option }
        for option in primary { byId[option.userId] = option }
        return byId.values.sorted {
            $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
        }
    }

    private func deleteTask() async {
        guard case let .edit(task) = mode else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            _ = try await session.api.request(
                "/workspaces/\(task.workspaceId)/projects/\(task.projectId)/items/\(task.id)",
                method: "DELETE",
                response: EmptyResponse.self
            )
            onSaved(); dismiss()
        } catch { errorMessage = error.localizedDescription }
    }

    private func sendComment() async {
        guard case let .edit(task) = mode else { return }
        let text = newComment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        do {
            _ = try await session.api.request(
                "/workspaces/\(task.workspaceId)/projects/\(task.projectId)/items/\(task.id)/comments", method: "POST",
                body: CommentPayload(body: text, parentCommentId: nil), response: CommentResponse.self
            )
            newComment = ""
            await loadDetail(taskId: task.id, commentsOnly: true)
        } catch { errorMessage = error.localizedDescription }
    }

    private static func parse(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private static func format(_ value: Date) -> String { ISO8601DateFormatter().string(from: value) }

    private var navigationTitle: String {
        if isEditing { return "任务详情" }
        if naturalLanguageResponse != nil || stickyNoteParse != nil { return "确认新任务" }
        return "新建任务"
    }

    private func naturalLanguageConfirmations(for response: NaturalLanguageParseResponse) -> [String] {
        response.assumptions
            + response.ambiguities
            + response.missingFields.map { "请补充或确认：\($0)" }
    }
}

private struct TaskAssigneeSelectionView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dismissSearch) private var dismissSearch
    let users: [AssignableUser]
    @Binding var selection: String
    @State private var searchText = ""

    var body: some View {
        List {
            ForEach(filteredUsers) { user in
                Button {
                    selection = user.userId
                    dismiss()
                } label: {
                    TaskMemberOptionRow(user: user, isSelected: selection == user.userId)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == user.userId ? .isSelected : [])
            }
        }
        .navigationTitle("选择负责人")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "搜索姓名或邮箱")
        .scrollDismissesKeyboard(.interactively)
        .keyboardDoneToolbar { dismissSearch() }
        .overlay {
            if filteredUsers.isEmpty, !searchText.isEmpty {
                ContentUnavailableView.search(text: searchText)
            }
        }
    }

    private var filteredUsers: [AssignableUser] {
        filterTaskMembers(users, query: searchText)
    }
}

private struct TaskParticipantsSelectionView: View {
    @Environment(\.dismissSearch) private var dismissSearch
    let users: [AssignableUser]
    @Binding var selection: Set<String>
    @State private var searchText = ""

    var body: some View {
        List(filteredUsers) { user in
            Button {
                if selection.contains(user.userId) {
                    selection.remove(user.userId)
                } else {
                    selection.insert(user.userId)
                }
            } label: {
                TaskMemberOptionRow(user: user, isSelected: selection.contains(user.userId))
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selection.contains(user.userId) ? .isSelected : [])
        }
        .navigationTitle("选择成员")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "搜索姓名或邮箱")
        .scrollDismissesKeyboard(.interactively)
        .keyboardDoneToolbar { dismissSearch() }
        .overlay {
            if filteredUsers.isEmpty {
                ContentUnavailableView(
                    searchText.isEmpty ? "暂无可选成员" : "未找到成员",
                    systemImage: searchText.isEmpty ? "person.2.slash" : "magnifyingglass",
                    description: Text(searchText.isEmpty ? "当前项目没有其他可选成员" : "请尝试其他姓名或邮箱")
                )
            }
        }
    }

    private var filteredUsers: [AssignableUser] {
        filterTaskMembers(users, query: searchText)
    }
}

private struct TaskMemberOptionRow: View {
    let user: AssignableUser
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Text(String(user.displayName.prefix(1)).uppercased())
                .font(.subheadline.weight(.bold))
                .foregroundStyle(TimiaTheme.primary)
                .frame(width: 34, height: 34)
                .background(TimiaTheme.primary.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                if !user.email.isEmpty {
                    Text(user.email)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(isSelected ? TimiaTheme.primary : Color.secondary.opacity(0.45))
        }
        .contentShape(Rectangle())
    }
}

private func filterTaskMembers(_ users: [AssignableUser], query: String) -> [AssignableUser] {
    let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return users }
    return users.filter {
        $0.displayName.localizedCaseInsensitiveContains(value)
            || $0.email.localizedCaseInsensitiveContains(value)
    }
}

private struct TaskChoiceRow: View {
    let title: String
    @Binding var selection: String
    let options: [TaskChoiceOption]
    let onSelection: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))

            HStack(spacing: 8) {
                ForEach(options) { option in
                    let isSelected = selection == option.id

                    Button {
                        onSelection()
                        selection = option.id
                    } label: {
                        HStack(spacing: 4) {
                            if isSelected {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 11, weight: .bold))
                            }

                            Text(option.label)
                                .lineLimit(1)
                                .minimumScaleFactor(0.78)
                        }
                        .font(.system(size: 13, weight: isSelected ? .bold : .semibold, design: .rounded))
                        .foregroundStyle(isSelected ? Color.white : option.color)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(
                            isSelected ? option.color : option.color.opacity(0.06),
                            in: RoundedRectangle(cornerRadius: 9)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 9)
                                .stroke(
                                    option.color.opacity(isSelected ? 1 : 0.28),
                                    lineWidth: isSelected ? 2 : 1
                                )
                        }
                        .shadow(
                            color: isSelected ? option.color.opacity(0.24) : .clear,
                            radius: 4,
                            y: 2
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                    .accessibilityValue(isSelected ? "已选择" : "")
                }
            }
        }
        .animation(.easeInOut(duration: 0.16), value: selection)
    }
}

private struct TaskCommentSendButtonStyle: ButtonStyle {
    let tint: Color
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .background(
                tint.opacity(configuration.isPressed ? 0.72 : 1),
                in: RoundedRectangle(cornerRadius: 10)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(isEnabled ? 1 : 0.42)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private extension String {
    var nilIfBlank: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

private extension Color {
    var hexString: String? {
        guard let components = UIColor(self).cgColor.components else { return nil }
        let values = components.count == 2 ? [components[0], components[0], components[0]] : Array(components.prefix(3))
        return String(format: "#%02X%02X%02X", Int(values[0] * 255), Int(values[1] * 255), Int(values[2] * 255))
    }
}
