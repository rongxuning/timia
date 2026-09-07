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
        VStack(alignment: .leading, spacing: 10) {
            if state.workingCount > 0 {
                section(title: "\(state.workingCount) 进行中") {
                    if state.healthEnabled {
                        row(title: state.healthTitle, time: state.healthTimeLabel)
                    }
                    ForEach(visible(state.doingTodos)) { todo in
                        row(title: todo.title, time: todo.timeLabel)
                    }
                }
            }

            if !state.notStartedTodos.isEmpty {
                section(title: "\(state.notStartedCount) 未开始") {
                    ForEach(visible(state.notStartedTodos)) { todo in
                        row(title: todo.title, time: todo.timeLabel)
                    }
                }
            }

            if !state.overdueTodos.isEmpty {
                section(title: "\(state.overdueCount) 逾期") {
                    ForEach(visible(state.overdueTodos)) { todo in
                        row(title: todo.title, time: todo.timeLabel)
                    }
                }
            }

            if !state.todos.isEmpty {
                section(title: "\(state.allDayCount) 全天") {
                    ForEach(visible(state.todos)) { todo in
                        row(title: todo.title, time: todo.timeLabel)
                    }
                }
            }

            if state.totalCount == 0 {
                Text("暂无展示内容")
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .environment(\.colorScheme, palette.forcedColorScheme)
        .activityBackgroundTint(palette.backgroundTint)
        .activitySystemActionForegroundColor(palette.actionForeground)
    }

    @ViewBuilder
    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption2.weight(.medium))
                .foregroundStyle(palette.secondaryText)
            content()
        }
    }

    private func visible(_ todos: [TimiaScreenActivityAttributes.ContentState.TodoRow]) -> [TimiaScreenActivityAttributes.ContentState.TodoRow] {
        Array(todos.prefix(3))
    }

    private func row(title: String, time: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "sparkle")
                .font(.caption)
                .foregroundStyle(palette.accent)
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(palette.primaryText)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(time)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(palette.secondaryText)
                .lineLimit(1)
        }
    }
}
