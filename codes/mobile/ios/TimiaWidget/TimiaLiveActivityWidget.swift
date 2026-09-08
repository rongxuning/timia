import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TimiaWidgetBundle: WidgetBundle {
    var body: some Widget {
        TimiaLiveActivityWidget()
    }
}

struct TimiaLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimiaScreenActivityAttributes.self) { context in
            TimiaLiveActivityLockScreenView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.totalCount) 待办", systemImage: "sparkle")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 4) {
                        if context.state.healthEnabled {
                            Text(context.state.healthTitle)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                        }
                        if let first = context.state.previewTodo {
                            Text(first.title)
                                .font(.caption)
                                .lineLimit(1)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 4) {
                        if context.state.healthEnabled {
                            Text(context.state.healthTimeLabel)
                                .font(.caption2.monospacedDigit())
                        }
                        if let first = context.state.previewTodo {
                            Text(first.timeLabel)
                                .font(.caption2.monospacedDigit())
                        }
                    }
                    .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "sparkle")
            } compactTrailing: {
                Text("\(context.state.totalCount)")
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: "sparkle")
            }
        }
    }
}

private extension TimiaScreenActivityAttributes.ContentState {
    var previewTodo: TodoRow? {
        notStartedTodos.first ?? overdueTodos.first ?? todos.first ?? doingTodos.first
    }
}

struct TimiaLiveActivityLockScreenView: View {
    @Environment(\.colorScheme) private var colorScheme
    let state: TimiaScreenActivityAttributes.ContentState

    private var palette: TimiaLiveActivityPalette {
        TimiaLiveActivityPalette.make(colorScheme: colorScheme)
    }

    var body: some View {
        ViewThatFits(in: .vertical) {
            lockScreenContent(maxRows: TimiaScreenActivityAttributes.ContentState.lockScreenVisibleRowLimit)
            lockScreenContent(maxRows: 4)
            lockScreenContent(maxRows: 3)
            lockScreenContent(maxRows: 2)
            lockScreenContent(maxRows: 1)
            lockScreenContent(maxRows: 1, includeWorkingHeader: false)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .environment(\.colorScheme, palette.forcedColorScheme)
        .activityBackgroundTint(palette.backgroundTint)
        .activitySystemActionForegroundColor(palette.actionForeground)
    }

    @ViewBuilder
    private func lockScreenContent(maxRows: Int, includeWorkingHeader: Bool = true) -> some View {
        let items = state.lockScreenItems(maxRows: maxRows)
        VStack(alignment: .leading, spacing: 6) {
            if includeWorkingHeader, state.showsWorkingHeader {
                Text(state.workingHeaderTitle)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(palette.secondaryText)
            }

            ForEach(items) { item in
                lockScreenRow(item)
            }

            if items.isEmpty {
                Text("暂无展示内容")
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)
            }
        }
        .padding(14)
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func lockScreenRow(_ item: TimiaScreenActivityAttributes.ContentState.LockScreenItem) -> some View {
        switch item {
        case .health:
            row(
                title: state.healthTitle,
                statusSymbol: "sparkle",
                statusColor: palette.accent,
                statusLabel: "健康同步",
                time: state.healthTimeLabel,
                muted: false
            )
        case .todo(let todo):
            row(
                title: todo.title,
                statusSymbol: TaskProgressStyle.symbolName(for: todo.status),
                statusColor: palette.color(fromHex: TaskProgressStyle.colorHex(for: todo.status)),
                statusLabel: TaskProgressStyle.accessibilityLabel(for: todo.status),
                time: todo.timeLabel,
                muted: false
            )
        case .more:
            row(
                title: TimiaScreenActivityAttributes.ContentState.LockScreenItem.moreTitle,
                statusSymbol: nil,
                statusColor: palette.secondaryText,
                statusLabel: nil,
                time: "",
                muted: true
            )
        }
    }

    private func row(
        title: String,
        statusSymbol: String?,
        statusColor: Color,
        statusLabel: String?,
        time: String,
        muted: Bool
    ) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(muted ? palette.secondaryText : palette.primaryText)
                .lineLimit(1)
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            if let statusSymbol {
                Image(systemName: statusSymbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
                    .accessibilityLabel(statusLabel ?? "")
            }
            if !time.isEmpty {
                Text(time)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
    }
}
