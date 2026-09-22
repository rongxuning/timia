import SwiftUI

struct ScheduleMapFanOverlay: View {
    let cluster: ScheduleMapTaskCluster
    let origin: CGPoint
    let canvas: CGSize
    @Binding var index: Double
    var onSelect: (ScheduleMapItem) -> Void
    var onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var dragStartIndex: Double?

    var body: some View {
        let layout = scheduleMapFanLayout(origin: origin, canvas: canvas)
        let center = Int(index.rounded())
        ZStack(alignment: .topLeading) {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { onDismiss() }
            VStack(spacing: 8) {
                Text("\(center + 1) / \(cluster.items.count)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                ZStack {
                    ForEach(Array(cluster.items.enumerated()), id: \.element.id) { itemIndex, item in
                        if let slot = scheduleMapFanSlot(offset: Double(itemIndex) - index) {
                            let angle = (Double(itemIndex) - index) * layout.angleStep * .pi / 180
                            let x = sin(angle) * scheduleMapFanRadius
                            let y = layout.direction * (1 - cos(angle)) * scheduleMapFanRadius
                            fanCard(item: item, itemIndex: itemIndex, center: center)
                                .rotationEffect(.degrees(slot.rotate * layout.direction))
                                .scaleEffect(slot.scale)
                                .opacity(slot.opacity)
                                .offset(x: x, y: y - scheduleMapFanCardHeight)
                                .zIndex(20 - abs(Double(itemIndex) - index) * 10)
                        }
                    }
                }
                .frame(width: 200, height: scheduleMapFanCardHeight)
            }
            .position(x: origin.x + layout.shiftX, y: origin.y)
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if dragStartIndex == nil { dragStartIndex = index }
                    index = applyScheduleMapFanDrag(index: dragStartIndex ?? index, dx: value.translation.width, count: cluster.items.count)
                }
                .onEnded { value in
                    let start = dragStartIndex ?? index
                    dragStartIndex = nil
                    let dx = value.translation.width
                    let dy = value.translation.height
                    let predicted = value.predictedEndTranslation
                    let vx = predicted.width
                    let vy = predicted.height
                    if isScheduleMapFanDismissFlick(vx: vx, vy: vy) {
                        onDismiss()
                        return
                    }
                    if isScheduleMapFanTap(dx: dx, dy: dy, speed: hypot(vx, vy)) {
                        return
                    }
                    index = Double(snapScheduleMapFanIndex(index: applyScheduleMapFanDrag(index: start, dx: dx, count: cluster.items.count), vx: vx, count: cluster.items.count))
                }
        )
    }

    private func fanCard(item: ScheduleMapItem, itemIndex: Int, center: Int) -> some View {
        let style = SchedulePriorityStyle(
            priority: item.priority,
            colorScheme: colorScheme,
            isCompleted: isCalendarTaskCompleted(item.status)
        )
        let time = scheduleMapTimeLabel(startAt: item.startAt, endAt: item.endAt)
        let status = scheduleMapStatusLabel(item.status)
        return Button {
            if itemIndex == center {
                onSelect(item)
            } else {
                index = Double(itemIndex)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.caption.weight(.semibold)).foregroundStyle(style.foreground).lineLimit(1)
                Text(time).font(.caption2).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
                Text(status).font(.caption2).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(width: 200, alignment: .leading)
            .background(style.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(style.accent.opacity(0.55), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("第 \(itemIndex + 1) 张，共 \(cluster.items.count) 张，\(item.title)，\(time)，\(status)")
    }
}
