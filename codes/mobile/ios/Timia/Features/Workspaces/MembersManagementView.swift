import SwiftUI

struct MembersManagementView: View {
    enum Scope {
        case workspace(WorkspaceCard)
        case project(workspace: WorkspaceCard, project: Project)
    }

    let scope: Scope
    @EnvironmentObject private var session: AppSession
    @State private var members: [MembershipRow] = []
    @State private var candidates: [AssignableUser] = []
    @State private var canManage = false
    @State private var creatorId: String?
    @State private var query = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var title: String {
        switch scope { case .workspace: "工作空间成员"; case .project: "项目成员" }
    }

    private var filteredCandidates: [AssignableUser] {
        let memberIds = Set(members.map(\.userId))
        let available = candidates.filter { !memberIds.contains($0.userId) }
        let key = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !key.isEmpty else { return available }
        return available.filter { $0.displayName.lowercased().contains(key) || $0.email.lowercased().contains(key) || $0.userId.lowercased().contains(key) }
    }

    var body: some View {
        List {
            if !canManage && !isLoading {
                Section {
                    Label("你当前仅可查看；成员变更需要负责人权限。", systemImage: "eye")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }

            Section("当前成员 · \(members.count)") {
                ForEach(sortedMembers) { member in
                    MemberRowView(member: member, canManage: canManage && !member.isCreator) { role in
                        Task { await updateRole(member, role: role) }
                    }
                    .swipeActions {
                        if canManage && !member.isCreator {
                            Button(role: .destructive) { Task { await remove(member) } } label: { Label("移除", systemImage: "person.badge.minus") }
                        }
                    }
                }
                if members.isEmpty && !isLoading { Text("暂无成员").foregroundStyle(.secondary) }
            }

            if canManage {
                Section("添加成员") {
                    ForEach(filteredCandidates) { user in
                        HStack {
                            VStack(alignment: .leading) { Text(user.displayName); Text(user.email).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Menu {
                                Button("添加为负责人") { Task { await add(user, role: "owner") } }
                                Button("添加为成员") { Task { await add(user, role: "member") } }
                            } label: { Image(systemName: "person.badge.plus") }
                        }
                    }
                    if filteredCandidates.isEmpty { Text("没有可添加的成员").foregroundStyle(.secondary) }
                }
            }

            if isLoading { Section { ProgressView() } }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }
        .navigationTitle(title)
        .searchable(text: $query, prompt: "搜索姓名、邮箱或用户 ID")
        .refreshable { await load() }
        .task { await load() }
        .disabled(isLoading)
    }

    private var sortedMembers: [MembershipRow] {
        members.sorted {
            if $0.isCreator != $1.isCreator { return $0.isCreator }
            if $0.role != $1.role { return $0.role == "owner" }
            return $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true; errorMessage = nil
        do {
            switch scope {
            case let .workspace(workspace):
                let page = try await session.api.request("/views/workspace/\(workspace.id)/members-page", response: WorkspaceMembersPage.self)
                members = page.members; candidates = page.assignableUsers; canManage = page.canManageWorkspace; creatorId = page.createdByUserId
            case let .project(workspace, project):
                let page = try await session.api.request("/views/workspace/\(workspace.id)/projects/\(project.id)/members-page", response: ProjectMembersPage.self)
                members = page.projectMembers; candidates = page.workspaceMemberPool; canManage = page.canManageProject; creatorId = page.createdByUserId
            }
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func add(_ user: AssignableUser, role: String) async {
        let effectiveRole = user.userId == creatorId ? "owner" : role
        await mutate(method: "POST", suffix: "", body: MemberAddPayload(userId: user.userId, role: effectiveRole))
    }

    private func updateRole(_ member: MembershipRow, role: String) async {
        await mutate(method: "PATCH", suffix: "/\(member.userId)", body: MemberRolePayload(role: role))
    }

    private func remove(_ member: MembershipRow) async {
        await mutate(method: "DELETE", suffix: "/\(member.userId)", body: nil)
    }

    private func mutate(method: String, suffix: String, body: (any Encodable & Sendable)?) async {
        isLoading = true; errorMessage = nil
        do {
            _ = try await session.api.request("\(membersBasePath)\(suffix)", method: method, body: body, response: EmptyResponse.self)
            isLoading = false
            await load()
        } catch { errorMessage = error.localizedDescription; isLoading = false }
    }

    private var membersBasePath: String {
        switch scope {
        case let .workspace(workspace): "/workspaces/\(workspace.id)/members"
        case let .project(workspace, project): "/workspaces/\(workspace.id)/projects/\(project.id)/members"
        }
    }
}

private struct MemberRowView: View {
    let member: MembershipRow
    let canManage: Bool
    let onRoleChange: (String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(String(member.displayName.prefix(1)).uppercased()).font(.headline).frame(width: 38, height: 38).background(TimiaTheme.primary.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack { Text(member.displayName); if member.isCreator { Text("创建人").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2).background(.orange.opacity(0.13), in: Capsule()) } }
                Text(member.email).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if canManage {
                Menu {
                    Button("负责人") { onRoleChange("owner") }
                    Button("成员") { onRoleChange("member") }
                } label: { Text(member.role == "owner" ? "负责人" : "成员").font(.caption).padding(.horizontal, 8).padding(.vertical, 5).background(.thinMaterial, in: Capsule()) }
            } else {
                Text(member.role == "owner" ? "负责人" : "成员").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
