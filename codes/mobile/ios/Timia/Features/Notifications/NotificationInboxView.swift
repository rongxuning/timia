import SwiftUI

struct NotificationInboxView: View {
    @Binding var unreadCount: Int

    @EnvironmentObject private var session: AppSession
    @Environment(\.openURL) private var openURL
    @State private var items: [InboxNotification] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var isMarkingAll = false
    @State private var openedTask: ScheduleTask?
    @State private var openedRoute: NotificationAppLink?

    private var api: NotificationAPI { NotificationAPI(client: session.notificationApi) }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if isLoading && items.isEmpty {
                    ProgressView("加载中…")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else if items.isEmpty && errorMessage == nil {
                    ContentUnavailableView("还没有通知", systemImage: "bell", description: Text("新的任务和成员动态会出现在这里"))
                        .padding(.top, 24)
                }
                ForEach(items) { item in
                    Button {
                        Task { await open(item) }
                    } label: {
                        NotificationRow(item: item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(TimiaTheme.canvas)
        .navigationTitle("通知")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(isMarkingAll ? "处理中…" : "全部已读") {
                    Task { await markAll() }
                }
                .disabled(isMarkingAll || unreadCount == 0)
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .navigationDestination(item: $openedRoute) { link in
            NotificationRouteView(link: link)
        }
        .sheet(item: $openedTask) { task in
            NavigationStack {
                TaskEditorView(mode: .edit(task)) {}
            }
        }
    }

    private func load() async {
        if items.isEmpty { isLoading = true }
        do {
            let page = try await api.inbox()
            items = page.items
            unreadCount = page.unreadCount
            errorMessage = nil
        } catch {
            errorMessage = "加载失败"
        }
        isLoading = false
    }

    private func markAll() async {
        guard unreadCount > 0, !isMarkingAll else { return }
        isMarkingAll = true
        defer { isMarkingAll = false }
        do {
            _ = try await api.markAllRead()
            await load()
        } catch {
            errorMessage = "加载失败"
        }
    }

    private func open(_ item: InboxNotification) async {
        errorMessage = nil
        if item.isUnread {
            do {
                let updated = try await api.markRead(id: item.id)
                if let index = items.firstIndex(where: { $0.id == item.id }) {
                    items[index] = updated
                }
                unreadCount = max(0, unreadCount - 1)
            } catch {
                errorMessage = "加载失败"
                return
            }
        }
        if let link = NotificationLinkParser.parse(item.link) {
            switch link {
            case .task:
                openedTask = scheduleTask(for: link, title: item.title)
            case .project, .workspace:
                openedRoute = link
            }
            return
        }
        if let raw = item.link?.trimmingCharacters(in: .whitespacesAndNewlines),
           let url = URL(string: raw),
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            openURL(url)
        }
    }

    private func scheduleTask(for link: NotificationAppLink, title: String) -> ScheduleTask? {
        guard case let .task(workspaceId, projectId, itemId) = link else { return nil }
        return ScheduleTask(
            id: itemId,
            title: title,
            body: nil,
            color: "#FFFFFF",
            status: "todo",
            priority: nil,
            startAt: nil,
            endAt: nil,
            completedAt: nil,
            details: nil,
            version: 1,
            createdBy: nil,
            assignee: nil,
            participants: nil,
            location: nil,
            workspaceId: workspaceId,
            workspaceName: "",
            projectId: projectId,
            projectName: ""
        )
    }
}

private struct NotificationRow: View {
    let item: InboxNotification

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    if !item.body.isEmpty {
                        Text(item.body)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(item.isUnread ? "未读" : "已读")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(item.isUnread ? TimiaTheme.primary : .secondary)
            }
            HStack(spacing: 8) {
                Text(item.senderLabel)
                Text(NotificationTimeText.string(from: item.createdAt))
                if NotificationLinkParser.parse(item.link) != nil || isWebURL(item.link) {
                    Text("查看")
                        .foregroundStyle(TimiaTheme.primary)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(item.isUnread ? TimiaTheme.primary.opacity(0.35) : TimiaTheme.border.opacity(0.45), lineWidth: 1)
        }
    }

    private func isWebURL(_ raw: String?) -> Bool {
        guard let raw, let url = URL(string: raw), let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }
}

struct NotificationRouteView: View {
    let link: NotificationAppLink

    @EnvironmentObject private var session: AppSession
    @State private var workspace: WorkspaceCard?
    @State private var project: Project?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        Group {
            if let workspace, let project, case .project = link {
                ProjectTasksView(workspace: workspace, project: project)
            } else if let workspace, case .workspace = link {
                WorkspaceDetailView(workspace: workspace)
            } else if isLoading {
                ProgressView("正在打开…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView(
                    "无法打开",
                    systemImage: "bell.slash",
                    description: Text(errorMessage ?? "未找到")
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TimiaTheme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .task { await load() }
    }

    private func load() async {
        let workspaceId: String
        let projectId: String?
        switch link {
        case .task:
            errorMessage = "未找到"
            isLoading = false
            return
        case let .project(id, projectID):
            workspaceId = id
            projectId = projectID
        case let .workspace(id):
            workspaceId = id
            projectId = nil
        }
        do {
            let cards: [WorkspaceCard] = try await session.api.request(
                "/workspaces/cards",
                response: [WorkspaceCard].self
            )
            guard let card = cards.first(where: { $0.id == workspaceId }) else {
                errorMessage = "未找到"
                isLoading = false
                return
            }
            if let projectId {
                let projects: [Project] = try await session.api.request(
                    "/workspaces/\(workspaceId)/projects",
                    response: [Project].self
                )
                guard let match = projects.first(where: { $0.id == projectId }) else {
                    errorMessage = "未找到"
                    isLoading = false
                    return
                }
                self.project = match
            }
            self.workspace = card
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
