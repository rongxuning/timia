import SwiftUI

private struct TaskChoiceOption: Identifiable {
    let id: String
    let label: String
    let color: Color
}

private let taskPriorityOptions = [
    TaskChoiceOption(id: "1", label: "低", color: Color(hex: "#3B82F6")),
    TaskChoiceOption(id: "2", label: "中", color: Color(hex: "#22C55E")),
    TaskChoiceOption(id: "3", label: "高", color: Color(hex: "#F97316")),
    TaskChoiceOption(id: "4", label: "紧急", color: Color(hex: "#EF4444"))
]

private let taskStatusOptions = [
    TaskChoiceOption(id: "todo", label: "待办", color: Color(hex: "#64748B")),
    TaskChoiceOption(id: "doing", label: "进行中", color: Color(hex: "#3B82F6")),
    TaskChoiceOption(id: "done", label: "已完成", color: Color(hex: "#10B981")),
    TaskChoiceOption(id: "archived", label: "已归档", color: Color(hex: "#8B5CF6"))
]

struct TaskEditorView: View {
    enum Mode {
        case create
        case createOn(Date)
        case createAt(Date)
        case createIn(workspaceId: String, projectId: String)
        case edit(ScheduleTask)
    }

    let mode: Mode
    let onSaved: () -> Void

    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var workspaces: [WorkspaceCard] = []
    @State private var projects: [Project] = []
    @State private var workspaceId = ""
    @State private var projectId = ""
    @State private var title = ""
    @State private var bodyText = ""
    @State private var details = ""
    @State private var location = ""
    @State private var color = "#FFFFFF"
    @State private var status = "todo"
    @State private var priority = "1"
    @State private var startDate = Date()
    @State private var endDate = Date().addingTimeInterval(3600)
    @State private var comments: [TaskComment] = []
    @State private var newComment = ""
    @State private var version = 1
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    var body: some View {
        Form {
            LabeledContent("空间") {
                Picker("工作空间", selection: $workspaceId) {
                    Text("请选择").tag("")
                    ForEach(workspaces) { Text($0.name).tag($0.id) }
                }
                .labelsHidden()
                .disabled(isEditing || isFixedCreate)
                .onChange(of: workspaceId) { _, _ in Task { await loadProjects() } }
            }

            LabeledContent("项目") {
                Picker("项目", selection: $projectId) {
                    Text("请选择").tag("")
                    ForEach(projects) { Text($0.name).tag($0.id) }
                }
                .labelsHidden()
                .disabled(isEditing || isFixedCreate)
            }

            TextField("标题", text: $title)
            TextField("正文", text: $bodyText, axis: .vertical)
                .lineLimit(3...8)
            TextField("地点", text: $location)

            TaskChoiceRow(selection: $priority, options: taskPriorityOptions)
            TaskChoiceRow(selection: $status, options: taskStatusOptions)

            ColorPicker("任务颜色", selection: Binding(
                get: { Color(hex: color) },
                set: { color = $0.hexString ?? "#FFFFFF" }
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
            }
            .onChange(of: startDate) { oldValue, newValue in
                guard endDate <= newValue else { return }
                let previousDuration = max(3_600, endDate.timeIntervalSince(oldValue))
                endDate = newValue.addingTimeInterval(previousDuration)
            }

            if isEditing {
                Text("评论")
                    .font(.headline)
                ForEach(comments) { comment in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(comment.authorDisplayName).font(.subheadline.bold()); Spacer(); Text(comment.createdAtLabel).font(.caption).foregroundStyle(.secondary) }
                        Text(comment.body)
                    }
                }
                TextField("添加评论", text: $newComment, axis: .vertical)
                Button("发送评论") { Task { await sendComment() } }
                    .disabled(newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }

            if isEditing {
                Button("删除任务", role: .destructive) { Task { await deleteTask() } }
            }
        }
        .navigationTitle(isEditing ? "任务详情" : "新建任务")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "保存中…" : "保存") { Task { await save() } }
                    .disabled(
                        isSaving
                            || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || workspaceId.isEmpty
                            || projectId.isEmpty
                            || endDate <= startDate
                    )
            }
        }
        .task { await prepare() }
    }

    private var isFixedCreate: Bool {
        if case .createIn = mode { return true }
        return false
    }

    private func prepare() async {
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
        if let date = Self.parse(task.startAt) { startDate = date }
        if let date = Self.parse(task.endAt) { endDate = date }
    }

    private func loadWorkspaces() async {
        do {
            workspaces = try await session.api.request("/workspaces/cards", response: [WorkspaceCard].self)
            if workspaceId.isEmpty, let first = workspaces.first { workspaceId = first.id; await loadProjects() }
        } catch { errorMessage = error.localizedDescription }
    }

    private func loadProjects() async {
        guard !workspaceId.isEmpty else { projects = []; projectId = ""; return }
        do {
            projects = try await session.api.request("/workspaces/\(workspaceId)/projects", response: [Project].self)
            if !projects.contains(where: { $0.id == projectId }) { projectId = projects.first?.id ?? "" }
        } catch { errorMessage = error.localizedDescription }
    }

    private func loadDetail(taskId: String) async {
        do {
            let detail = try await session.api.request("/views/workspace/\(workspaceId)/projects/\(projectId)/items/\(taskId)/detail", response: ItemDetail.self)
            title = detail.title; bodyText = detail.body ?? ""; details = detail.details ?? ""; location = detail.location ?? ""
            color = detail.color; status = detail.status; priority = detail.priority ?? "1"; version = detail.version; comments = detail.comments ?? []
        } catch { errorMessage = error.localizedDescription }
    }

    private func save() async {
        isSaving = true; errorMessage = nil
        do {
            switch mode {
            case .create, .createOn, .createAt, .createIn:
                _ = try await session.api.request(
                    "/workspaces/\(workspaceId)/projects/\(projectId)/items", method: "POST", body: payload(), response: ItemResponse.self
                )
            case let .edit(task):
                let update = ItemUpdatePayload(
                    version: version, title: title.trimmingCharacters(in: .whitespacesAndNewlines), body: bodyText.nilIfBlank,
                    color: color.uppercased(), status: status, priority: priority,
                    startAt: Self.format(startDate), endAt: Self.format(endDate),
                    details: details.nilIfBlank, location: location.nilIfBlank
                )
                _ = try await session.api.request(
                    "/workspaces/\(workspaceId)/projects/\(projectId)/items/\(task.id)", method: "PATCH", body: update, response: ItemResponse.self
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
            endAt: Self.format(endDate), details: details.nilIfBlank, location: location.nilIfBlank
        )
    }

    private func deleteTask() async {
        guard case let .edit(task) = mode else { return }
        do {
            _ = try await session.api.request("/workspaces/\(workspaceId)/projects/\(projectId)/items/\(task.id)", method: "DELETE", response: EmptyResponse.self)
            onSaved(); dismiss()
        } catch { errorMessage = error.localizedDescription }
    }

    private func sendComment() async {
        guard case let .edit(task) = mode else { return }
        let text = newComment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        do {
            _ = try await session.api.request(
                "/workspaces/\(workspaceId)/projects/\(projectId)/items/\(task.id)/comments", method: "POST",
                body: CommentPayload(body: text, parentCommentId: nil), response: CommentResponse.self
            )
            newComment = ""
            await loadDetail(taskId: task.id)
        } catch { errorMessage = error.localizedDescription }
    }

    private static func parse(_ value: String?) -> Date? {
        guard let value else { return nil }
        return ISO8601DateFormatter().date(from: value)
    }

    private static func format(_ value: Date) -> String { ISO8601DateFormatter().string(from: value) }
}

private struct TaskChoiceRow: View {
    @Binding var selection: String
    let options: [TaskChoiceOption]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options) { option in
                let isSelected = selection == option.id

                Button {
                    selection = option.id
                } label: {
                    Text(option.label)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(option.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(
                            option.color.opacity(isSelected ? 0.18 : 0.06),
                            in: RoundedRectangle(cornerRadius: 9)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 9)
                                .stroke(
                                    option.color.opacity(isSelected ? 0.9 : 0.28),
                                    lineWidth: isSelected ? 1.5 : 1
                                )
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
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
