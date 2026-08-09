import SwiftUI

/// Inline preview of the AI-generated task draft for a sticky note.
///
/// v1 simplify: workspace + project IDs are *required* by the backend, so
/// we use a single hard-coded default (the user's first workspace) and let
/// them confirm. v2 will fetch the user's real workspace/project list and
/// present a proper picker.
struct StickyNoteDraftPreview: View {
    let parse: StickyNoteAIParse
    var workspaceId: String = ""
    var projectId: String = ""
    var isConverting: Bool = false
    var showConvertButton: Bool = true
    var onConvert: (String /* workspaceId */, String /* projectId */) -> Void
    var onClose: () -> Void

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

            // Hints below draft info, above the action divider.
            if !parse.ambiguities.isEmpty {
                hintSection("歧义", parse.ambiguities, color: .orange)
            }
            if !parse.missingFields.isEmpty {
                hintSection("缺失信息", parse.missingFields, color: .orange)
            }
            if !parse.assumptions.isEmpty {
                hintSection("模型假设", parse.assumptions, color: .secondary)
            }

            if showConvertButton {
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
            }
        }
        .padding(10)
        .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 8))
    }

    private var canConvert: Bool {
        !workspaceId.isEmpty && !projectId.isEmpty
    }

    @ViewBuilder
    private func hintSection(_ title: String, _ items: [String], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
            ForEach(items, id: \.self) { item in
                Text("· \(item)")
                    .font(.caption2)
                    .foregroundStyle(color)
            }
        }
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
