import SwiftUI

/// Inline preview of the AI-generated task draft for a sticky note.
///
/// v1 simplify: workspace + project IDs are *required* by the backend, so
/// we use a single hard-coded default (the user's first workspace) and let
/// them confirm. v2 will fetch the user's real workspace/project list and
/// present a proper picker.
struct StickyNoteDraftPreview: View {
    let parse: StickyNoteAIParse
    var isConverting: Bool = false
    var onConvert: (String /* workspaceId */, String /* projectId */) -> Void
    var onClose: () -> Void

    @State private var workspaceId: String = ""
    @State private var projectId: String = ""
    @State private var didSetDefaults: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "sparkles")
                Text("任务预览")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }

            if let draft = parse.draft {
                previewRow("标题", draft.title)
                if let body = draft.body, !body.isEmpty {
                    previewRow("内容", body)
                }
                if let start = draft.startAt {
                    previewRow("开始", format(start))
                }
                if let end = draft.endAt {
                    previewRow("结束", format(end))
                }
                previewRow("状态", statusLabel(draft.status))
                previewRow("优先级", priorityLabel(draft.priority))
                if let loc = draft.location, !loc.isEmpty {
                    previewRow("地点", loc)
                }
                if let ws = draft.workspaceName { previewRow("工作空间", ws) }
                if let pj = draft.projectName { previewRow("项目", pj) }
                if let who = draft.assigneeName { previewRow("负责人", who) }
                if !draft.participantNames.isEmpty {
                    previewRow("参与人", draft.participantNames.joined(separator: "、"))
                }
            }

            if !parse.assumptions.isEmpty {
                Text("模型假设")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(parse.assumptions, id: \.self) { a in
                    Text("· \(a)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if !parse.missingFields.isEmpty {
                Text("缺失信息")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                ForEach(parse.missingFields, id: \.self) { m in
                    Text("· \(m)")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
            if !parse.ambiguities.isEmpty {
                Text("歧义")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                ForEach(parse.ambiguities, id: \.self) { a in
                    Text("· \(a)")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }

            Divider()
            HStack {
                Spacer()
                Button {
                    onConvert(workspaceId, projectId)
                } label: {
                    HStack(spacing: 4) {
                        if isConverting {
                            ProgressView().tint(.white).controlSize(.mini)
                        } else {
                            Image(systemName: "arrow.right.circle.fill")
                        }
                        Text("转化为任务")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(canConvert ? TimiaTheme.primary : Color.secondary.opacity(0.35), in: Capsule())
                }
                .disabled(!canConvert || isConverting)
            }

            if workspaceId.isEmpty {
                Text("提示：暂未配置默认工作空间，请先在「工作空间」页选择默认工作空间后再转化。")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
        .padding(10)
        .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 8))
    }

    private var canConvert: Bool {
        !workspaceId.isEmpty && !projectId.isEmpty
    }

    private func previewRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(width: 50, alignment: .leading)
            Text(value)
                .font(.caption)
                .lineLimit(3)
            Spacer()
        }
    }

    private func statusLabel(_ s: String) -> String {
        switch s {
        case "todo": return "待办"
        case "doing": return "进行中"
        case "done": return "已完成"
        case "archived": return "已归档"
        default: return s
        }
    }

    private func priorityLabel(_ p: String) -> String {
        switch p {
        case "1": return "P1 · 低"
        case "2": return "P2"
        case "3": return "P3"
        case "4": return "P4 · 高"
        default: return p
        }
    }

    private func format(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) ?? Date()
        let out = DateFormatter()
        out.dateFormat = "MM-dd HH:mm"
        return out.string(from: date)
    }
}
