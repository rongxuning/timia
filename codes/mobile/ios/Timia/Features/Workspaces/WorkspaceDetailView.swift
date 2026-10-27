import SwiftUI

struct WorkspaceDetailView: View {
    let workspace: WorkspaceCard
    @EnvironmentObject private var session: AppSession
    @State private var projects: [WorkspaceProjectCard] = []
    @State private var isLoading = false
    @State private var discussions: [DiscussionItem] = []
    @State private var discussionsLoading = false
    @State private var discussionsHasMore = true
    @State private var incompleteOnly = false
    @State private var includeComments = true
    @State private var includeReplies = true
    @State private var discussionRequestSequence = 0
    @State private var errorMessage: String?
    @State private var projectForm: ProjectFormView.Mode?
    @State private var selectedTask: ScheduleTask?
    @State private var deleteProjectTarget: WorkspaceProjectCard?

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                GeometryReader { proxy in
                    let cardWidth = WorkspaceProjectCardLayout.width(for: proxy.size.width)

                    ScrollView(.horizontal) {
                        LazyHStack(spacing: WorkspaceProjectCardLayout.spacing) {
                            ForEach(projects) { project in
                                WorkspaceProjectCardSection(
                                    workspace: workspace,
                                    project: project,
                                    width: cardWidth,
                                    onFavorite: { Task { await toggleFavorite(project) } },
                                    onEdit: {
                                        projectForm = .edit(project.asProject(workspaceId: workspace.id))
                                    },
                                    onDelete: { deleteProjectTarget = project }
                                )
                                .contextMenu {
                                    Button { Task { await toggleFavorite(project) } } label: {
                                        Label(
                                            project.isFavorite ? "取消收藏" : "收藏",
                                            systemImage: project.isFavorite ? "heart.slash" : "heart"
                                        )
                                    }
                                    if project.canManage {
                                        Button {
                                            projectForm = .edit(project.asProject(workspaceId: workspace.id))
                                        } label: {
                                            Label("编辑项目", systemImage: "pencil")
                                        }
                                        Button(role: .destructive) {
                                            deleteProjectTarget = project
                                        } label: {
                                            Label("删除项目", systemImage: "trash")
                                        }
                                    }
                                }
                            }

                            Button { projectForm = .create } label: {
                                AddProjectCard(width: cardWidth)
                            }
                            .buttonStyle(.plain)
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, WorkspaceProjectCardLayout.horizontalInset)
                    }
                    .scrollTargetBehavior(.viewAligned)
                    .scrollIndicators(.hidden)
                }
                .frame(height: WorkspaceProjectCardLayout.viewportHeight)
            }
            .padding(.top, 12)
            .padding(.bottom, 10)
            .background(TimiaTheme.canvas)

            Divider()

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Text("最近讨论").font(.headline)
                    Spacer()
                    if discussionsLoading { ProgressView().controlSize(.small) }
                    Menu {
                        Toggle("仅未完成", isOn: $incompleteOnly)
                        Toggle("显示评论", isOn: $includeComments)
                        Toggle("显示回复", isOn: $includeReplies)
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .font(.title3)
                            .foregroundStyle(TimiaTheme.primary)
                    }
                    .accessibilityLabel("筛选最近讨论")
                }
                .padding(.horizontal)
                .padding(.vertical, 12)

                ScrollView(.vertical) {
                    LazyVStack(spacing: 10) {
                        if discussions.isEmpty && !discussionsLoading {
                            ContentUnavailableView("暂无评论", systemImage: "bubble.left.and.bubble.right")
                                .padding(.top, 30)
                        }

                        ForEach(discussions) { item in
                            Button { selectedTask = makeTask(item) } label: {
                                WorkspaceCommentCard(item: item)
                            }
                            .buttonStyle(.plain)
                            .onAppear {
                                if item.id == discussions.last?.id, discussionsHasMore {
                                    Task { await loadDiscussions(reset: false) }
                                }
                            }
                        }

                        if !discussionsHasMore && !discussions.isEmpty {
                            Text("已加载全部评论").font(.caption).foregroundStyle(.secondary).padding(.vertical, 8)
                        }

                        if let errorMessage {
                            Text(errorMessage).font(.footnote).foregroundStyle(.red).padding()
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom)
                }
                .scrollIndicators(.visible)
                .refreshable { await loadAll() }
            }
            .background(TimiaTheme.canvas)
        }
        .navigationTitle(workspace.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    NavigationLink { MembersManagementView(scope: .workspace(workspace)) } label: { Label("成员", systemImage: "person.3") }
                    NavigationLink { WorkspaceActivityView(workspace: workspace) } label: { Label("活动记录", systemImage: "clock.arrow.circlepath") }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .onChange(of: discussionFilterKey) { _, _ in
            Task { await loadDiscussions(reset: true) }
        }
        .task { await loadAll() }
        .sheet(item: $projectForm) { mode in NavigationStack { ProjectFormView(workspaceId: workspace.id, mode: mode) { _ in Task { await loadProjects() } } } }
        .sheet(item: $selectedTask) { task in
            NavigationStack { TaskEditorView(mode: .edit(task)) { Task { await loadDiscussions(reset: true) } } }
        }
        .alert(
            "删除项目",
            isPresented: Binding(
                get: { deleteProjectTarget != nil },
                set: { if !$0 { deleteProjectTarget = nil } }
            ),
            presenting: deleteProjectTarget
        ) { project in
            Button("取消", role: .cancel) { deleteProjectTarget = nil }
            Button("删除", role: .destructive) {
                deleteProjectTarget = nil
                Task { await delete(project) }
            }
        } message: { project in
            Text("确定删除“\(project.name)”吗？此操作无法撤销。")
        }
    }

    private var discussionFilterKey: String {
        "\(incompleteOnly)-\(includeComments)-\(includeReplies)"
    }

    private func loadAll() async {
        await loadProjects()
        await loadDiscussions(reset: true)
    }

    private func loadProjects() async {
        isLoading = true
        do {
            let dashboard = try await session.api.request(
                "/views/workspace/\(workspace.id)/dashboard",
                response: WorkspaceDashboard.self
            )
            projects = dashboard.activeProjects
            errorMessage = nil
        }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func loadDiscussions(reset: Bool) async {
        if !reset { guard !discussionsLoading, discussionsHasMore else { return } }
        if reset { discussionRequestSequence += 1 }
        let sequence = discussionRequestSequence
        discussionsLoading = true
        do {
            let offset = reset ? 0 : discussions.count
            let response = try await session.api.request(
                "/views/workspace/\(workspace.id)/discussions",
                query: [
                    URLQueryItem(name: "limit", value: "20"),
                    URLQueryItem(name: "offset", value: String(offset)),
                    URLQueryItem(name: "incomplete_only", value: String(incompleteOnly)),
                    URLQueryItem(name: "include_comments", value: String(includeComments)),
                    URLQueryItem(name: "include_replies", value: String(includeReplies))
                ],
                response: WorkspaceDiscussions.self
            )
            guard sequence == discussionRequestSequence else { return }
            if reset {
                discussions = response.items
            } else {
                let seen = Set(discussions.map(\.id))
                discussions.append(contentsOf: response.items.filter { !seen.contains($0.id) })
            }
            discussionsHasMore = response.hasMore
            errorMessage = nil
        } catch {
            guard sequence == discussionRequestSequence else { return }
            errorMessage = error.localizedDescription
        }
        if sequence == discussionRequestSequence { discussionsLoading = false }
    }

    private func toggleFavorite(_ project: WorkspaceProjectCard) async {
        guard let index = projects.firstIndex(where: { $0.id == project.id }) else { return }
        let next = !project.isFavorite
        withAnimation {
            projects[index].isFavorite = next
            projects.sort {
                if $0.isFavorite != $1.isFavorite { return $0.isFavorite && !$1.isFavorite }
                if $0.createdAt != $1.createdAt { return $0.createdAt > $1.createdAt }
                return $0.id > $1.id
            }
        }
        do {
            _ = try await session.api.request(
                "/workspaces/\(workspace.id)/projects/\(project.id)/favorite",
                method: "PATCH",
                body: FavoritePayload(isFavorite: next),
                response: EmptyResponse.self
            )
        } catch {
            errorMessage = error.localizedDescription
            await loadProjects()
        }
    }

    private func delete(_ project: WorkspaceProjectCard) async {
        do {
            _ = try await session.api.request("/workspaces/\(workspace.id)/projects/\(project.id)", method: "DELETE", response: EmptyResponse.self)
            projects.removeAll { $0.id == project.id }
        } catch { errorMessage = error.localizedDescription }
    }

    private func makeTask(_ item: DiscussionItem) -> ScheduleTask {
        ScheduleTask(
            id: item.itemId,
            title: item.itemTitle,
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
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            projectId: item.projectId,
            projectName: item.projectName
        )
    }
}

private enum WorkspaceProjectCardLayout {
    static let horizontalInset: CGFloat = 16
    static let spacing: CGFloat = 12
    /// Enough of the next card stays on screen that the row reads as a carousel.
    static let peek: CGFloat = 52
    static let minimumWidth: CGFloat = 128
    static let topHeight: CGFloat = 118
    static let bottomHeight: CGFloat = 97
    static let height: CGFloat = topHeight + bottomHeight + 1
    static let viewportHeight: CGFloat = height + 12
    static let bottomInset: CGFloat = 12
    static let maxActionSide: CGFloat = 26

    static func width(for viewport: CGFloat) -> CGFloat {
        let raw = (viewport - horizontalInset * 2 - spacing - peek) / 2
        return max(minimumWidth, raw)
    }

    /// Side length that keeps four actions on one row inside `bottomInset`.
    static func actionSide(for cardWidth: CGFloat) -> CGFloat {
        let inner = max(0, cardWidth - bottomInset * 2)
        let slot = inner / 4
        return min(maxActionSide, max(CGFloat(22), (slot - 3).rounded(.down)))
    }
}

private struct WorkspaceProjectCardSection: View {
    let workspace: WorkspaceCard
    let project: WorkspaceProjectCard
    let width: CGFloat
    let onFavorite: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    private var actionSide: CGFloat { WorkspaceProjectCardLayout.actionSide(for: width) }

    var body: some View {
        ZStack(alignment: .bottom) {
            NavigationLink {
                ProjectTasksView(
                    workspace: workspace,
                    project: project.asProject(workspaceId: workspace.id)
                )
            } label: {
                WorkspaceProjectCardTile(
                    project: project,
                    width: width,
                    actionSlotHeight: actionSide
                )
            }
            .buttonStyle(.plain)

            actionRow
                .padding(.horizontal, WorkspaceProjectCardLayout.bottomInset)
                .padding(.bottom, WorkspaceProjectCardLayout.bottomInset)
                .frame(width: width, alignment: .bottom)
        }
        .frame(width: width)
    }

    private var actionRow: some View {
        HStack(spacing: 0) {
            Button(action: onFavorite) {
                ProjectCardActionIcon(
                    systemName: project.isFavorite ? "heart.fill" : "heart",
                    accessibilityLabel: project.isFavorite ? "取消收藏" : "收藏项目",
                    side: actionSide
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            if project.canManage {
                Button(action: onEdit) {
                    ProjectCardActionIcon(
                        systemName: "pencil",
                        accessibilityLabel: "编辑项目",
                        side: actionSide
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }

            NavigationLink {
                MembersManagementView(
                    scope: .project(
                        workspace: workspace,
                        project: project.asProject(workspaceId: workspace.id)
                    )
                )
            } label: {
                ProjectCardActionIcon(
                    systemName: project.canManage ? "person.badge.plus" : "person.2",
                    accessibilityLabel: project.canManage ? "管理项目成员" : "查看项目成员",
                    side: actionSide
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            if project.canManage {
                Button(action: onDelete) {
                    ProjectCardActionIcon(
                        systemName: "trash",
                        accessibilityLabel: "删除项目",
                        isDestructive: true,
                        side: actionSide
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct WorkspaceProjectCardTile: View {
    let project: WorkspaceProjectCard
    let width: CGFloat
    let actionSlotHeight: CGFloat

    private var total: Int { project.todoDoing + project.doneArchived }
    private var progress: Double {
        guard total > 0 else { return 0 }
        return Double(project.doneArchived) / Double(total)
    }

    var body: some View {
        let cardForeground = TimiaTheme.foreground(on: project.color)
        let inset = WorkspaceProjectCardLayout.bottomInset

        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(project.name)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(cardForeground)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                Text(projectDescription)
                    .font(.system(size: 12, weight: .regular, design: .rounded))
                    .foregroundStyle(cardForeground.opacity(0.78))
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
            }
            .padding(12)
            .frame(width: width, height: WorkspaceProjectCardLayout.topHeight, alignment: .topLeading)
            .background(TimiaTheme.customSurface(project.color))

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("项目进度")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 4)
                    Text("\(project.doneArchived)/\(total)（\(project.progressPercent)%）")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(TimiaTheme.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.55)
                        .monospacedDigit()
                        .layoutPriority(1)
                }

                ProgressView(value: progress)
                    .tint(TimiaTheme.primary)
                    .frame(maxWidth: .infinity, maxHeight: 6)

                Spacer(minLength: 8)

                Color.clear
                    .frame(height: actionSlotHeight)
                    .frame(maxWidth: .infinity)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, inset)
            .padding(.top, inset)
            .padding(.bottom, inset)
            .frame(width: width, height: WorkspaceProjectCardLayout.bottomHeight, alignment: .top)
            .background(TimiaTheme.card)
        }
        .frame(width: width, height: WorkspaceProjectCardLayout.height)
        .background(TimiaTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 15))
        .overlay {
            RoundedRectangle(cornerRadius: 15)
                .stroke(Color(uiColor: .separator).opacity(0.32), lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 15))
    }

    private var projectDescription: String {
        guard let description = project.description?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !description.isEmpty else {
            return "暂无描述。"
        }
        return description
    }
}

private struct ProjectCardActionIcon: View {
    let systemName: String
    let accessibilityLabel: String
    var isDestructive = false
    var side: CGFloat = 26

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: max(CGFloat(11), side * 0.46), weight: .semibold))
            .foregroundStyle(isDestructive ? Color.red : TimiaTheme.primary)
            .frame(width: side, height: side)
            .background(
                (isDestructive ? Color.red : TimiaTheme.primary).opacity(0.045),
                in: RoundedRectangle(cornerRadius: 6)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 6)
                    .stroke(
                        (isDestructive ? Color.red : TimiaTheme.primary).opacity(0.28),
                        lineWidth: 1
                    )
            }
            .accessibilityLabel(accessibilityLabel)
    }
}

private struct AddProjectCard: View {
    let width: CGFloat

    var body: some View {
        VStack(spacing: 9) {
            Image(systemName: "plus.circle.fill").font(.system(size: 32)).foregroundStyle(TimiaTheme.primary)
            Text("添加项目").font(.subheadline.weight(.semibold))
        }
        .frame(width: width, height: WorkspaceProjectCardLayout.height)
        .background(TimiaTheme.card, in: RoundedRectangle(cornerRadius: 17))
        .overlay {
            RoundedRectangle(cornerRadius: 17)
                .stroke(TimiaTheme.primary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [6]))
        }
    }
}

private struct WorkspaceCommentCard: View {
    let item: DiscussionItem

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(TimiaTheme.primary.opacity(0.12))
                .frame(width: 34, height: 34)
                .overlay {
                    Text(String(item.authorDisplayName.prefix(1)))
                        .font(.caption.bold())
                        .foregroundStyle(TimiaTheme.primary)
                }

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(item.authorDisplayName).font(.subheadline.bold())
                    Text(item.isReply ? "回复" : "评论")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(TimiaTheme.primary.opacity(0.1), in: Capsule())
                    Spacer()
                    Text(item.createdAgoLabel).font(.caption2).foregroundStyle(.tertiary)
                }
                Text(item.body).foregroundStyle(.primary).multilineTextAlignment(.leading)
                Text("\(item.projectName) · \(item.itemTitle)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(12)
        .background(TimiaTheme.card, in: RoundedRectangle(cornerRadius: 15))
    }
}

private enum ProjectFormFocusField: Hashable {
    case name
    case description
}

struct ProjectFormView: View {
    enum Mode: Identifiable {
        case create
        case edit(Project)
        var id: String { switch self { case .create: "create"; case let .edit(value): value.id } }
    }
    let workspaceId: String
    let mode: Mode
    let onSaved: (_ createdId: String?) -> Void
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var color = "#FFFFFF"
    @State private var errorMessage: String?
    @FocusState private var focusedField: ProjectFormFocusField?

    var body: some View {
        Form {
            TextField("项目名称", text: $name)
                .focused($focusedField, equals: .name)
                .submitLabel(.next)
                .onSubmit { focusedField = .description }
            TextField("描述", text: $description, axis: .vertical)
                .focused($focusedField, equals: .description)
            ColorPicker(
                "标识颜色",
                selection: Binding(
                    get: { Color(hex: color) },
                    set: {
                        focusedField = nil
                        color = $0.projectHex ?? "#FFFFFF"
                    }
                )
            )
            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(isCreate ? "创建项目" : "编辑项目")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("取消") {
                    focusedField = nil
                    dismiss()
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    focusedField = nil
                    Task { await save() }
                }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .keyboardDoneToolbar { focusedField = nil }
        .onDisappear { focusedField = nil }
        .onAppear { if case let .edit(value) = mode { name = value.name; description = value.description ?? ""; color = value.color } }
    }

    private var isCreate: Bool { if case .create = mode { return true }; return false }
    private func save() async {
        let payload = ProjectPayload(name: name.trimmingCharacters(in: .whitespacesAndNewlines), description: description.isEmpty ? nil : description, color: color.uppercased())
        do {
            switch mode {
            case .create:
                let created = try await session.api.request("/workspaces/\(workspaceId)/projects", method: "POST", body: payload, response: Project.self)
                onSaved(created.id)
            case let .edit(value):
                _ = try await session.api.request("/workspaces/\(workspaceId)/projects/\(value.id)", method: "PATCH", body: payload, response: Project.self)
                onSaved(nil)
            }
            dismiss()
        } catch { errorMessage = error.localizedDescription }
    }
}

private extension Color {
    var projectHex: String? {
        guard let components = UIColor(self).cgColor.components else { return nil }
        let values = components.count == 2 ? [components[0], components[0], components[0]] : Array(components.prefix(3))
        return String(format: "#%02X%02X%02X", Int(values[0] * 255), Int(values[1] * 255), Int(values[2] * 255))
    }
}
