import SwiftUI

private enum ProjectTaskGroup: String, CaseIterable, Identifiable {
    case overdue
    case today
    case thisWeek
    case future
    case completed
    case archived

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overdue: "逾期"
        case .today: "今日"
        case .thisWeek: "本周"
        case .future: "未来"
        case .completed: "已完成"
        case .archived: "已归档"
        }
    }

    var symbol: String {
        switch self {
        case .overdue: "exclamationmark.circle.fill"
        case .today: "sun.max.fill"
        case .thisWeek: "calendar"
        case .future: "arrow.right.circle"
        case .completed: "checkmark.circle.fill"
        case .archived: "archivebox.fill"
        }
    }

    var color: Color {
        switch self {
        case .overdue: Color(hex: "#EF4444")
        case .today: TimiaTheme.primary
        case .thisWeek: Color(hex: "#3B82F6")
        case .future: Color(hex: "#64748B")
        case .completed: TaskStatusPalette.done
        case .archived: TaskStatusPalette.archived
        }
    }
}

struct ProjectTasksView: View {
    let workspace: WorkspaceCard
    let project: Project

    @EnvironmentObject private var session: AppSession
    @Environment(\.navigateToAppHome) private var navigateToAppHome
    @Environment(\.colorScheme) private var colorScheme

    @State private var tasks: [ScheduleTask] = []
    @State private var updatingTaskIds: Set<String> = []
    @State private var revealedTaskId: String?
    @State private var revealedEdge: TaskCardRevealEdge?
    @State private var errorMessage: String?
    @State private var editTask: ScheduleTask?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(ProjectTaskGroup.allCases) { group in
                    taskSection(group)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(TimiaTheme.canvas)
        .navigationTitle("\(workspace.name)/\(project.name)")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: navigateToAppHome) {
                    Image(systemName: "house.fill")
                }
                .accessibilityLabel("返回首页")
                .accessibilityIdentifier("project-home-button")
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editTask) { task in
            NavigationStack {
                TaskEditorView(mode: .edit(task), onSaved: reload)
            }
        }
    }

    private func taskSection(_ group: ProjectTaskGroup) -> some View {
        let groupedTasks = tasks(in: group)

        return VStack(alignment: .leading, spacing: 10) {
            TaskGroupHeader(
                title: group.title,
                symbol: group.symbol,
                count: groupedTasks.count,
                color: group.color
            )

            ForEach(groupedTasks) { task in
                taskCard(task)
            }

            if groupedTasks.isEmpty {
                Text("暂无任务")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.vertical, 6)
            }
        }
        .padding(14)
        .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(TimiaTheme.border.opacity(0.45))
        }
        .accessibilityIdentifier("project-task-section-\(group.id)")
    }

    private func taskCard(_ task: ScheduleTask) -> some View {
        SwipeTaskCard(
            task: task,
            colorScheme: colorScheme,
            isUpdating: updatingTaskIds.contains(task.id),
            revealedEdge: revealedTaskId == task.id ? revealedEdge : nil,
            onReveal: { edge in
                revealedTaskId = edge == nil ? nil : task.id
                revealedEdge = edge
            },
            onToggleCompletion: {
                let nextStatus = task.status == "todo" || task.status == "doing" ? "done" : "todo"
                closeQuickActions()
                Task { await updateStatus(task, status: nextStatus) }
            },
            onStatusChange: { status in
                closeQuickActions()
                Task { await updateStatus(task, status: status) }
            },
            onPriorityChange: { priority in
                closeQuickActions()
                Task { await updatePriority(task, priority: priority) }
            },
            onTap: {
                if revealedTaskId == task.id {
                    withAnimation(.easeOut(duration: 0.2)) {
                        closeQuickActions()
                    }
                } else {
                    editTask = task
                }
            }
        )
    }

    private func closeQuickActions() {
        revealedTaskId = nil
        revealedEdge = nil
    }

    private func reload() {
        Task { await load() }
    }

    @MainActor
    private func load() async {
        do {
            let response = try await session.api.request(
                "/workspaces/\(workspace.id)/projects/\(project.id)/items",
                response: [ItemResponse].self
            )
            tasks = response.map(scheduleTask)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func updateStatus(_ task: ScheduleTask, status: String) async {
        guard task.status != status, !updatingTaskIds.contains(task.id) else { return }
        updatingTaskIds.insert(task.id)

        var optimisticTask = task
        optimisticTask.status = status
        optimisticTask.completedAt = status == "done" ? ISO8601DateFormatter().string(from: Date()) : nil
        replaceTask(optimisticTask)

        do {
            let response = try await session.api.request(
                "/workspaces/\(workspace.id)/projects/\(project.id)/items/\(task.id)",
                method: "PATCH",
                body: TodoTaskStatusUpdatePayload(
                    version: task.version,
                    status: status,
                    completedAt: optimisticTask.completedAt
                ),
                response: ItemResponse.self
            )
            apply(response, fallback: optimisticTask)
            errorMessage = nil
        } catch {
            replaceTask(task)
            errorMessage = error.localizedDescription
        }

        updatingTaskIds.remove(task.id)
    }

    @MainActor
    private func updatePriority(_ task: ScheduleTask, priority: String) async {
        guard task.priority != priority, !updatingTaskIds.contains(task.id) else { return }
        updatingTaskIds.insert(task.id)

        var optimisticTask = task
        optimisticTask.priority = priority
        replaceTask(optimisticTask)

        do {
            let response = try await session.api.request(
                "/workspaces/\(workspace.id)/projects/\(project.id)/items/\(task.id)",
                method: "PATCH",
                body: TodoTaskPriorityUpdatePayload(version: task.version, priority: priority),
                response: ItemResponse.self
            )
            apply(response, fallback: optimisticTask)
            errorMessage = nil
        } catch {
            replaceTask(task)
            errorMessage = error.localizedDescription
        }

        updatingTaskIds.remove(task.id)
    }

    private func replaceTask(_ task: ScheduleTask) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[index] = task
    }

    private func apply(_ response: ItemResponse, fallback: ScheduleTask) {
        var updated = fallback
        updated.title = response.title
        updated.body = response.body
        updated.color = response.color
        updated.status = response.status
        updated.priority = response.priority
        updated.startAt = response.startAt
        updated.endAt = response.endAt
        updated.completedAt = response.completedAt
        updated.details = response.details
        updated.version = response.version
        updated.location = response.location
        replaceTask(updated)
    }

    private func tasks(in group: ProjectTaskGroup) -> [ScheduleTask] {
        tasks
            .filter { taskGroup(for: $0) == group }
            .sorted {
                let left = targetDate(for: $0) ?? .distantFuture
                let right = targetDate(for: $1) ?? .distantFuture
                return left == right ? $0.title < $1.title : left < right
            }
    }

    private func taskGroup(for task: ScheduleTask) -> ProjectTaskGroup {
        if task.status == "archived" { return .archived }
        if task.status == "done" { return .completed }

        guard let date = targetDate(for: task) else { return .future }
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)

        if date < startOfToday { return .overdue }
        if calendar.isDateInToday(date) { return .today }
        if let week = calendar.dateInterval(of: .weekOfYear, for: now),
           date < week.end {
            return .thisWeek
        }
        return .future
    }

    private func targetDate(for task: ScheduleTask) -> Date? {
        Self.parseISO(task.endAt) ?? Self.parseISO(task.startAt)
    }

    private static func parseISO(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func scheduleTask(_ item: ItemResponse) -> ScheduleTask {
        ScheduleTask(
            id: item.id,
            title: item.title,
            body: item.body,
            color: item.color,
            status: item.status,
            priority: item.priority,
            startAt: item.startAt,
            endAt: item.endAt,
            completedAt: item.completedAt,
            details: item.details,
            version: item.version,
            createdBy: nil,
            assignee: nil,
            participants: nil,
            location: item.location,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            projectId: project.id,
            projectName: project.name
        )
    }
}
