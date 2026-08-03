import SwiftUI

struct WorkspacesView: View {
    @EnvironmentObject private var session: AppSession
    @State private var workspaces: [WorkspaceCard] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var formMode: WorkspaceFormView.Mode?
    @State private var deleteTarget: WorkspaceCard?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(workspaces) { workspace in
                    WorkspaceCardSection(
                        workspace: workspace,
                        onFavorite: { Task { await toggleFavorite(workspace) } },
                        onEdit: { formMode = .edit(workspace) },
                        onDelete: { deleteTarget = workspace }
                    )
                    .contextMenu {
                        Button { Task { await toggleFavorite(workspace) } } label: {
                            Label(workspace.isFavorite ? "取消收藏" : "收藏", systemImage: workspace.isFavorite ? "star.slash" : "star")
                        }
                        if workspace.myWorkspaceRole == "owner" {
                            Button { formMode = .edit(workspace) } label: { Label("编辑空间", systemImage: "pencil") }
                            Button(role: .destructive) { deleteTarget = workspace } label: { Label("删除空间", systemImage: "trash") }
                        }
                    }
                }

                Button { formMode = .create } label: { AddWorkspaceCard() }
                    .buttonStyle(.plain)
            }
            .padding()
        }
        .background(TimiaTheme.canvas)
        .overlay {
            if isLoading && workspaces.isEmpty { ProgressView("正在加载空间…") }
        }
        .navigationTitle("空间")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $formMode) { mode in
            NavigationStack { WorkspaceFormView(mode: mode) { Task { await load() } } }
        }
        .alert(
            "删除空间",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            ),
            presenting: deleteTarget
        ) { workspace in
            Button("取消", role: .cancel) { deleteTarget = nil }
            Button("删除", role: .destructive) {
                deleteTarget = nil
                Task { await delete(workspace) }
            }
        } message: { workspace in
            Text("确定删除“\(workspace.name)”吗？此操作无法撤销。")
        }
        .overlay(alignment: .bottom) {
            if let errorMessage, !workspaces.isEmpty {
                Text(errorMessage).font(.footnote).padding().background(.red.opacity(0.9), in: Capsule()).foregroundStyle(.white).padding()
            }
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        do {
            workspaces = try await session.api.request("/workspaces/cards", response: [WorkspaceCard].self)
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func toggleFavorite(_ workspace: WorkspaceCard) async {
        guard let index = workspaces.firstIndex(where: { $0.id == workspace.id }) else { return }
        let next = !workspace.isFavorite
        withAnimation { workspaces[index].isFavorite = next; workspaces.sort { $0.isFavorite && !$1.isFavorite } }
        do {
            _ = try await session.api.request("/workspaces/\(workspace.id)/favorite", method: "PATCH", body: FavoritePayload(isFavorite: next), response: EmptyResponse.self)
        } catch {
            errorMessage = error.localizedDescription
            await load()
        }
    }

    private func delete(_ workspace: WorkspaceCard) async {
        do {
            _ = try await session.api.request("/workspaces/\(workspace.id)", method: "DELETE", response: EmptyResponse.self)
            withAnimation { workspaces.removeAll { $0.id == workspace.id } }
        } catch { errorMessage = error.localizedDescription }
    }
}

private struct WorkspaceCardSection: View {
    let workspace: WorkspaceCard
    let onFavorite: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    private var isOwner: Bool { workspace.myWorkspaceRole == "owner" }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            NavigationLink {
                WorkspaceDetailView(workspace: workspace)
            } label: {
                WorkspaceCardTile(workspace: workspace)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("打开空间：\(workspace.name)")

            HStack(spacing: 8) {
                Button(action: onFavorite) {
                    WorkspaceCardActionIcon(
                        systemName: workspace.isFavorite ? "heart.fill" : "heart",
                        accessibilityLabel: workspace.isFavorite ? "取消收藏" : "收藏空间"
                    )
                }
                .buttonStyle(.plain)

                if isOwner {
                    Button(action: onEdit) {
                        WorkspaceCardActionIcon(systemName: "pencil", accessibilityLabel: "编辑空间")
                    }
                    .buttonStyle(.plain)
                }

                NavigationLink {
                    MembersManagementView(scope: .workspace(workspace))
                } label: {
                    WorkspaceCardActionIcon(
                        systemName: isOwner ? "person.badge.plus" : "person.2",
                        accessibilityLabel: isOwner ? "管理成员" : "查看成员"
                    )
                }
                .buttonStyle(.plain)

                if isOwner {
                    Button(action: onDelete) {
                        WorkspaceCardActionIcon(
                            systemName: "trash",
                            accessibilityLabel: "删除空间",
                            isDestructive: true
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.trailing, 12)
            .padding(.bottom, 12)
        }
    }
}

private struct WorkspaceCardTile: View {
    let workspace: WorkspaceCard

    var body: some View {
        let cardForeground = TimiaTheme.foreground(on: workspace.color)

        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(workspace.name)
                        .font(.title2.bold())
                        .foregroundStyle(cardForeground)
                        .lineLimit(2)

                    Text(workspaceDescription)
                        .font(.body)
                        .foregroundStyle(cardForeground.opacity(0.82))
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)

                VStack(alignment: .leading, spacing: 12) {
                    WorkspaceMetadataRow(label: "负责人", foreground: cardForeground) {
                        WorkspacePeoplePreview(people: workspace.owners, foreground: cardForeground)
                    }

                    WorkspaceMetadataRow(label: "成员", foreground: cardForeground) {
                        WorkspacePeoplePreview(people: workspace.members, foreground: cardForeground)
                    }

                    WorkspaceMetadataRow(label: "项目", foreground: cardForeground) {
                        Text("\(workspace.projectCount) 个")
                            .font(.headline)
                            .foregroundStyle(cardForeground)
                            .monospacedDigit()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 176, alignment: .topLeading)
            .background(TimiaTheme.customSurface(workspace.color))

            Divider()

            HStack(spacing: 10) {
                HStack(spacing: 5) {
                    WorkspaceStatusMetric(label: "待", count: workspace.todoCount, color: Color(hex: "#94A3B8"))
                    WorkspaceStatusMetric(label: "进", count: workspace.doingCount, color: Color(hex: "#3B82F6"))
                    WorkspaceStatusMetric(label: "完", count: workspace.doneCount, color: Color(hex: "#10B981"))
                    WorkspaceStatusMetric(label: "归", count: workspace.archivedCount, color: Color(hex: "#71717A"))
                }

                Spacer(minLength: 0)

                Color.clear
                    .frame(width: workspace.myWorkspaceRole == "owner" ? 184 : 88, height: 40)
            }
            .padding(12)
            .background(TimiaTheme.card)
        }
        .frame(maxWidth: .infinity)
        .background(TimiaTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color(uiColor: .separator).opacity(0.32), lineWidth: 1)
        }
        .shadow(color: TimiaTheme.shadow.opacity(0.35), radius: 8, y: 3)
        .contentShape(RoundedRectangle(cornerRadius: 18))
    }

    private var workspaceDescription: String {
        guard let description = workspace.description?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !description.isEmpty else {
            return "供团队与项目使用的协作空间。"
        }
        return description
    }
}

private struct WorkspaceMetadataRow<Content: View>: View {
    let label: String
    var foreground: Color = .primary
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(foreground)
                .frame(width: 48, alignment: .leading)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 34)
    }
}

private struct WorkspacePeoplePreview: View {
    let people: [WorkspacePerson]
    let foreground: Color

    var body: some View {
        if people.isEmpty {
            Text("—")
                .font(.caption)
                .foregroundStyle(foreground.opacity(0.52))
        } else {
            HStack(spacing: -8) {
                ForEach(Array(people.prefix(2)), id: \.id) { person in
                    Text(personInitial(person))
                        .font(.subheadline.bold())
                        .foregroundStyle(TimiaTheme.primary)
                        .frame(width: 34, height: 34)
                        .background(TimiaTheme.surface, in: Circle())
                        .overlay { Circle().stroke(TimiaTheme.surface, lineWidth: 2) }
                        .accessibilityLabel(person.displayName)
                }

                if people.count > 2 {
                    Text("+\(people.count - 2)")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                        .frame(width: 34, height: 34)
                        .background(Color(uiColor: .systemGray6), in: Circle())
                        .overlay { Circle().stroke(TimiaTheme.surface, lineWidth: 2) }
                }
            }
        }
    }

    private func personInitial(_ person: WorkspacePerson) -> String {
        let name = person.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let source = name.isEmpty ? person.email : name
        return String(source.prefix(1)).uppercased()
    }
}

private struct WorkspaceStatusMetric: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        HStack(spacing: 2) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text("\(label) \(count)")
                .font(.caption.bold())
                .foregroundStyle(color)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

private struct WorkspaceCardActionIcon: View {
    let systemName: String
    let accessibilityLabel: String
    var isDestructive = false

    var body: some View {
        Image(systemName: systemName)
            .font(.title3.bold())
            .foregroundStyle(isDestructive ? Color.red : TimiaTheme.primary)
            .frame(width: 40, height: 40)
            .background(
                (isDestructive ? Color.red : TimiaTheme.primary).opacity(0.035),
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        (isDestructive ? Color.red : TimiaTheme.primary).opacity(0.28),
                        lineWidth: 1
                    )
            }
            .accessibilityLabel(accessibilityLabel)
    }
}

private struct AddWorkspaceCard: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 34))
                .foregroundStyle(TimiaTheme.primary)
            Text("添加空间").font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, minHeight: 242)
        .padding(14)
        .background(TimiaTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(TimiaTheme.primary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [6]))
        }
    }
}

private enum WorkspaceFormFocusField: Hashable {
    case name
    case description
}

struct WorkspaceFormView: View {
    enum Mode: Identifiable {
        case create
        case edit(WorkspaceCard)
        var id: String { switch self { case .create: "create"; case let .edit(value): value.id } }
    }

    let mode: Mode
    let onSaved: () -> Void
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var color = "#FFFFFF"
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: WorkspaceFormFocusField?

    var body: some View {
        Form {
            Section {
                TextField("工作空间名称", text: $name)
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
                            color = $0.workspaceHex ?? "#FFFFFF"
                        }
                    )
                )
            }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(isCreate ? "创建工作空间" : "编辑工作空间")
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
                .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .keyboardDoneToolbar { focusedField = nil }
        .onDisappear { focusedField = nil }
        .onAppear {
            if case let .edit(value) = mode { name = value.name; description = value.description ?? ""; color = value.color }
        }
    }

    private var isCreate: Bool { if case .create = mode { return true }; return false }

    private func save() async {
        isSaving = true
        let payload = WorkspacePayload(name: name.trimmingCharacters(in: .whitespacesAndNewlines), description: description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : description, color: color.uppercased())
        do {
            switch mode {
            case .create:
                _ = try await session.api.request("/workspaces", method: "POST", body: payload, response: WorkspaceResponse.self)
            case let .edit(value):
                _ = try await session.api.request("/workspaces/\(value.id)", method: "PATCH", body: payload, response: WorkspaceResponse.self)
            }
            onSaved(); dismiss()
        } catch { errorMessage = error.localizedDescription }
        isSaving = false
    }
}

private extension Color {
    var workspaceHex: String? {
        guard let components = UIColor(self).cgColor.components else { return nil }
        let values = components.count == 2 ? [components[0], components[0], components[0]] : Array(components.prefix(3))
        return String(format: "#%02X%02X%02X", Int(values[0] * 255), Int(values[1] * 255), Int(values[2] * 255))
    }
}
