import SwiftUI

struct UserDirectoryView: View {
    @EnvironmentObject private var session: AppSession
    @State private var directory: UserDirectory?
    @State private var selectedUser: DirectoryUser?
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let directory {
                Section {
                    LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
                        StatCard(title: "用户", value: directory.userTotal, symbol: "person.3")
                        StatCard(title: "已加入空间", value: directory.usersWithWorkspace, symbol: "person.crop.circle.badge.checkmark", tint: .green)
                        StatCard(title: "未分配", value: directory.unassignedUserCount, symbol: "person.crop.circle.badge.questionmark", tint: .orange)
                        StatCard(title: "空间关系", value: directory.workspaceAssignmentsTotal, symbol: "link")
                    }
                    .padding(.vertical, 8)
                }
                Section("成员列表") {
                    ForEach(directory.users) { user in
                        Button { selectedUser = user } label: {
                            HStack {
                                Text(String(user.displayName.prefix(1)).uppercased()).font(.headline).frame(width: 38, height: 38).background(TimiaTheme.primary.opacity(0.12), in: Circle())
                                VStack(alignment: .leading) {
                                    HStack { Text(user.displayName).foregroundStyle(.primary); if user.systemRole == "admin" || user.systemRole == "system_admin" { Text("管理员").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2).background(.purple.opacity(0.12), in: Capsule()) } }
                                    Text("\(user.email) · \(user.workspaceCount) 个工作空间").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            } else if errorMessage == nil {
                ProgressView()
            }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
        }
        .navigationTitle("成员")
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $selectedUser) { user in NavigationStack { UserMembershipView(user: user) } }
    }

    private func load() async {
        do { directory = try await session.api.request("/views/users/directory", response: UserDirectory.self); errorMessage = nil }
        catch { errorMessage = error.localizedDescription }
    }
}

private struct UserMembershipView: View {
    let user: DirectoryUser
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var detail: UserMembershipDetail?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section { LabeledContent("邮箱", value: user.email); LabeledContent("状态", value: user.status) }
            if let detail {
                ForEach(detail.workspaces) { workspace in
                    Section(workspace.workspaceName) {
                        LabeledContent("角色", value: workspace.role)
                        LabeledContent("项目数", value: String(workspace.projectCount))
                        ForEach(workspace.projects) { project in Label(project.name, systemImage: project.archived ? "archivebox" : "folder") }
                    }
                }
                if detail.workspaces.isEmpty { ContentUnavailableView("尚未加入工作空间", systemImage: "person.crop.circle.badge.questionmark") }
            } else if errorMessage == nil { ProgressView() }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
        }
        .navigationTitle(user.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
        .task {
            do { detail = try await session.api.request("/views/users/\(user.id)/membership-detail", response: UserMembershipDetail.self) }
            catch { errorMessage = error.localizedDescription }
        }
    }
}
