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
                .padding(14)
                .activityBackgroundTint(.white.opacity(0.92))
                .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.workingCount) working", systemImage: "sparkle")
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
                        if let first = context.state.todos.first {
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
                        if let first = context.state.todos.first {
                            Text(first.timeLabel)
                                .font(.caption2.monospacedDigit())
                        }
                    }
                    .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "sparkle")
            } compactTrailing: {
                Text("\(context.state.workingCount)")
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: "sparkle")
            }
        }
    }
}

struct TimiaLiveActivityLockScreenView: View {
    let state: TimiaScreenActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(state.workingCount) working")
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)

            if state.healthEnabled {
                row(
                    title: state.healthTitle,
                    time: state.healthTimeLabel
                )
            }

            ForEach(state.todos) { todo in
                row(title: todo.title, time: todo.timeLabel)
            }

            if !state.healthEnabled && state.todos.isEmpty {
                Text("暂无展示内容")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(title: String, time: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "sparkle")
                .font(.caption)
                .foregroundStyle(Color(red: 0.25, green: 0.45, blue: 0.95))
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(time)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}
