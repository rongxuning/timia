import SwiftUI

struct WorkspaceActivityView: View {
    let workspace: WorkspaceCard
    @EnvironmentObject private var session: AppSession
    @State private var activity: WorkspaceActivity?
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let activity {
                Section {
                    HStack(spacing: 12) {
                        StatCard(title: "活动总数", value: activity.totalCount, symbol: "clock.arrow.circlepath")
                        VStack(alignment: .leading, spacing: 6) {
                            Text("最近活动").font(.caption).foregroundStyle(.secondary)
                            Text(activity.latestAtLabel ?? "暂无").font(.headline)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding().background(TimiaTheme.card, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .padding(.vertical, 6)
                }
                Section("时间线") {
                    ForEach(activity.items) { item in ActivityRow(item: item) }
                    if activity.items.isEmpty { Text("暂无活动记录").foregroundStyle(.secondary) }
                }
            } else if errorMessage == nil {
                ProgressView()
            }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
        }
        .navigationTitle("活动记录")
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            activity = try await session.api.request(
                "/views/workspace/\(workspace.id)/activity",
                query: [URLQueryItem(name: "limit", value: "100")],
                response: WorkspaceActivity.self
            )
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }
}

private struct ActivityRow: View {
    let item: ActivityItem
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).foregroundStyle(tint).frame(width: 30, height: 30).background(tint.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text("\(item.entityTypeLabel) · \(actionLabel)").font(.body.weight(.medium))
                Text("操作者 \(item.actorUserIdShort) · 对象 \(item.entityIdShort)").font(.caption).foregroundStyle(.secondary)
                Text(item.createdAtLabel).font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 5)
    }

    private var actionLabel: String {
        ["create": "创建", "update": "更新", "delete": "删除", "add_member": "添加成员", "remove_member": "移除成员"][item.action] ?? item.action
    }
    private var symbol: String {
        switch item.entityType { case "workspace": "square.grid.2x2"; case "project": "folder"; case "item": "checklist"; case "comment": "bubble.left"; default: "clock" }
    }
    private var tint: Color { item.action == "delete" || item.action.contains("remove") ? .red : TimiaTheme.primary }
}
