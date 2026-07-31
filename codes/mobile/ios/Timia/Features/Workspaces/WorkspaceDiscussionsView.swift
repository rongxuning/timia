import SwiftUI

struct WorkspaceDiscussionsView: View {
    let workspace: WorkspaceCard
    @EnvironmentObject private var session: AppSession
    @State private var items: [DiscussionItem] = []
    @State private var incompleteOnly = false
    @State private var includeComments = true
    @State private var includeReplies = true
    @State private var hasMore = true
    @State private var isLoading = false
    @State private var requestSequence = 0
    @State private var errorMessage: String?
    @State private var selectedTask: ScheduleTask?

    var body: some View {
        List {
            Section {
                Toggle("仅未完成", isOn: $incompleteOnly)
                Toggle("显示评论", isOn: $includeComments)
                Toggle("显示回复", isOn: $includeReplies)
            }
            .onChange(of: filterKey) { _, _ in Task { await load(reset: true) } }

            Section("讨论") {
                ForEach(items) { item in
                    Button { selectedTask = makeTask(item) } label: {
                        DiscussionRow(item: item)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .leading) {
                        if item.isAuthor {
                            Button { Task { await toggleCompletion(item) } } label: {
                                Label(item.completionStatus == "done" ? "标记未完成" : "标记完成", systemImage: item.completionStatus == "done" ? "arrow.uturn.backward.circle" : "checkmark.circle")
                            }
                            .tint(.green)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if item.isAuthor {
                            Button(role: .destructive) { Task { await delete(item) } } label: { Label("删除", systemImage: "trash") }
                        }
                    }
                    .onAppear {
                        if item.id == items.last?.id && hasMore { Task { await load(reset: false) } }
                    }
                }
                if items.isEmpty && !isLoading { Text("暂无任务评论").foregroundStyle(.secondary) }
                if isLoading { HStack { Spacer(); ProgressView(); Spacer() } }
                if !hasMore && !items.isEmpty { Text("已加载全部讨论").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity) }
            }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }
        .navigationTitle("最近讨论")
        .refreshable { await load(reset: true) }
        .task { await load(reset: true) }
        .sheet(item: $selectedTask) { task in NavigationStack { TaskEditorView(mode: .edit(task)) { Task { await load(reset: true) } } } }
    }

    private var filterKey: String { "\(incompleteOnly)-\(includeComments)-\(includeReplies)" }

    private func load(reset: Bool) async {
        if !reset { guard !isLoading, hasMore else { return } }
        if reset { requestSequence += 1 }
        let sequence = requestSequence
        isLoading = true; errorMessage = nil
        do {
            let offset = reset ? 0 : items.count
            let response = try await session.api.request(
                "/views/workspace/\(workspace.id)/discussions",
                query: [
                    URLQueryItem(name: "limit", value: "20"), URLQueryItem(name: "offset", value: String(offset)),
                    URLQueryItem(name: "incomplete_only", value: String(incompleteOnly)),
                    URLQueryItem(name: "include_comments", value: String(includeComments)),
                    URLQueryItem(name: "include_replies", value: String(includeReplies))
                ],
                response: WorkspaceDiscussions.self
            )
            guard sequence == requestSequence else { return }
            if reset { items = response.items }
            else {
                let seen = Set(items.map(\.id))
                items.append(contentsOf: response.items.filter { !seen.contains($0.id) })
            }
            hasMore = response.hasMore
        } catch {
            guard sequence == requestSequence else { return }
            errorMessage = error.localizedDescription
        }
        if sequence == requestSequence { isLoading = false }
    }

    private func toggleCompletion(_ item: DiscussionItem) async {
        let status = item.completionStatus == "done" ? "pending" : "done"
        do {
            _ = try await session.api.request(
                "/workspaces/\(workspace.id)/projects/\(item.projectId)/items/\(item.itemId)/comments/\(item.id)",
                method: "PATCH", body: CommentStatusPayload(completionStatus: status), response: CommentResponse.self
            )
            if let index = items.firstIndex(where: { $0.id == item.id }) { items[index].completionStatus = status }
            if incompleteOnly && status == "done" { items.removeAll { $0.id == item.id } }
        } catch { errorMessage = error.localizedDescription }
    }

    private func delete(_ item: DiscussionItem) async {
        do {
            _ = try await session.api.request(
                "/workspaces/\(workspace.id)/projects/\(item.projectId)/items/\(item.itemId)/comments/\(item.id)",
                method: "DELETE", response: EmptyResponse.self
            )
            items.removeAll { $0.id == item.id }
        } catch { errorMessage = error.localizedDescription }
    }

    private func makeTask(_ item: DiscussionItem) -> ScheduleTask {
        ScheduleTask(
            id: item.itemId, title: item.itemTitle, body: nil, color: "#FFFFFF", status: "todo", priority: nil,
            startAt: nil, endAt: nil, completedAt: nil, details: nil, version: 1, createdBy: nil, assignee: nil,
            participants: nil, location: nil, workspaceId: workspace.id, workspaceName: workspace.name,
            projectId: item.projectId, projectName: item.projectName
        )
    }
}

private struct DiscussionRow: View {
    let item: DiscussionItem
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: item.isReply ? "arrowshape.turn.up.left" : "bubble.left").foregroundStyle(TimiaTheme.primary)
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(item.authorDisplayName).font(.subheadline.bold())
                    Text(item.isReply ? "回复" : "评论").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2).background(.indigo.opacity(0.1), in: Capsule())
                    if item.completionStatus == "done" { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                }
                Text(item.body).foregroundStyle(.primary)
                Text("\(item.projectName) · \(item.itemTitle)").font(.caption).foregroundStyle(.secondary)
                Text("\(item.createdAtExactLabel) · \(item.createdAgoLabel)").font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }
}
