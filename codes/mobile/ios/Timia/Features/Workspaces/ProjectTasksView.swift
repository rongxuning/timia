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
        case .completed: "完成"
        case .archived: "归档"
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
        case .completed: Color(hex: "#10B981")
        case .archived: Color(hex: "#71717A")
        }
    }
}

struct ProjectTasksView: View {
    let workspace: WorkspaceCard
    let project: Project
    @EnvironmentObject private var session: AppSession
    @Environment(\.navigateToAppHome) private var navigateToAppHome
    @State private var items: [ItemResponse] = []
    @State private var errorMessage: String?
    @State private var editTask: ScheduleTask?

    var body: some View {
        List {
            if items.isEmpty, errorMessage == nil {
                ContentUnavailableView("暂无任务", systemImage: "checklist")
            } else {
                ForEach(ProjectTaskGroup.allCases) { group in
                    let groupedItems = items(in: group)

                    Section {
                        if groupedItems.isEmpty {
                            Text("暂无任务")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            ForEach(groupedItems) { item in
                                Button { editTask = scheduleTask(item) } label: {
                                    ProjectTaskRow(item: item, group: group)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    } header: {
                        TaskGroupHeader(
                            title: group.title,
                            symbol: group.symbol,
                            count: groupedItems.count,
                            color: group.color
                        )
                    }
                }
            }

            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
        }
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
        .sheet(item: $editTask) { task in NavigationStack { TaskEditorView(mode: .edit(task), onSaved: reload) } }
    }

    private func reload() { Task { await load() } }
    private func load() async {
        do { items = try await session.api.request("/workspaces/\(workspace.id)/projects/\(project.id)/items", response: [ItemResponse].self); errorMessage = nil }
        catch { errorMessage = error.localizedDescription }
    }

    private func items(in group: ProjectTaskGroup) -> [ItemResponse] {
        items
            .filter { taskGroup(for: $0) == group }
            .sorted {
                let left = targetDate(for: $0) ?? .distantFuture
                let right = targetDate(for: $1) ?? .distantFuture
                return left == right ? $0.title < $1.title : left < right
            }
    }

    private func taskGroup(for item: ItemResponse) -> ProjectTaskGroup {
        if item.status == "archived" { return .archived }
        if item.status == "done" { return .completed }

        guard let date = targetDate(for: item) else { return .future }
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

    private func targetDate(for item: ItemResponse) -> Date? {
        Self.parseISO(item.endAt) ?? Self.parseISO(item.startAt)
    }

    private static func parseISO(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func scheduleTask(_ item: ItemResponse) -> ScheduleTask {
        ScheduleTask(id: item.id, title: item.title, body: item.body, color: item.color, status: item.status, priority: item.priority, startAt: item.startAt, endAt: item.endAt, completedAt: nil, details: item.details, version: item.version, createdBy: nil, assignee: nil, participants: nil, location: item.location, workspaceId: workspace.id, workspaceName: workspace.name, projectId: project.id, projectName: project.name)
    }
}

private struct ProjectTaskRow: View {
    let item: ItemResponse
    let group: ProjectTaskGroup

    var body: some View {
        HStack(spacing: 11) {
            RoundedRectangle(cornerRadius: 2)
                .fill(taskMarkerColor)
                .frame(width: 4, height: 34)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                HStack(spacing: 7) {
                    Text(statusName)
                    Text("·")
                    Text(timeLabel)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 3)
        .contentShape(Rectangle())
    }

    private var taskMarkerColor: Color {
        let normalized = item.color.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return normalized == "#FFFFFF" ? group.color : Color(hex: normalized)
    }

    private var statusName: String {
        ["todo": "待办", "doing": "进行中", "done": "已完成", "archived": "已归档"][item.status]
            ?? item.status
    }

    private var timeLabel: String {
        guard let date = parseISO(item.endAt) ?? parseISO(item.startAt) else {
            return "未设置时间"
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "MM月dd日 HH:mm"
        return formatter.string(from: date)
    }

    private func parseISO(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
