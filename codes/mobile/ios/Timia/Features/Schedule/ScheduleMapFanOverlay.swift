import SwiftUI

struct ScheduleMapFanOverlay: View {
    let cluster: ScheduleMapTaskCluster
    let origin: CGPoint
    let canvas: CGSize
    @Binding var index: Double
    var onCloseStart: () -> Void = {}
    var onSelect: (ScheduleMapItem) -> Void
    var onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var dragStartIndex: Double?
    @State private var dragStartedAt: Date?
    @State private var dragActive = false
    @State private var presented = false
    @State private var closing = false
    @State private var closeTask: Task<Void, Never>?

    var body: some View {
        let layout = scheduleMapFanLayout(origin: origin, canvas: canvas)
        let count = cluster.items.count
        let center = min(max(0, count - 1), max(0, Int(index.rounded())))
        let flying = presented && !closing
        ZStack(alignment: .topLeading) {
            Color.clear
            Text("\(center + 1) / \(count)")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .position(x: origin.x + layout.shiftX, y: counterY(layout: layout))
                .allowsHitTesting(false)
            ForEach(Array(cluster.items.enumerated()), id: \.element.id) { itemIndex, item in
                if let slot = scheduleMapFanSlot(offset: Double(itemIndex) - index) {
                    let point = scheduleMapFanCardOffset(indexOffset: Double(itemIndex) - index, layout: layout)
                    fanCard(item: item, itemIndex: itemIndex)
                        .rotationEffect(.degrees(flying ? slot.rotate * layout.direction : 0))
                        .scaleEffect(flying ? slot.scale : 0.92)
                        .opacity(flying ? slot.opacity : 0)
                        .offset(
                            x: origin.x + layout.shiftX + (flying ? point.x : 0) - 100,
                            y: origin.y + (flying ? point.y : 0)
                        )
                        .zIndex(20 - abs(Double(itemIndex) - index) * 10)
                        .allowsHitTesting(false)
                        .animation(cardAnimation(itemIndex: itemIndex), value: presented)
                        .animation(cardAnimation(itemIndex: itemIndex), value: closing)
                        .animation(dragActive ? nil : .easeOut(duration: 0.22), value: index)
                }
            }
        }
        .frame(width: canvas.width, height: canvas.height, alignment: .topLeading)
        .contentShape(Rectangle())
        .gesture(fanDrag(layout: layout, center: center))
        .onAppear {
            presented = false
            Task { @MainActor in
                presented = true
            }
        }
        .onDisappear {
            closeTask?.cancel()
        }
    }

    private func counterY(layout: ScheduleMapFanLayout) -> CGFloat {
        if layout.direction > 0 {
            return origin.y + CGFloat(scheduleMapFanCardHeight) + 16
        }
        return origin.y - CGFloat(scheduleMapFanCardHeight) - 12
    }

    private func cardAnimation(itemIndex: Int) -> Animation {
        if closing {
            return .easeIn(duration: 0.28).delay(Double(max(0, cluster.items.count - 1 - itemIndex)) * 0.032)
        }
        return .easeOut(duration: 0.32).delay(Double(itemIndex) * 0.04)
    }

    private func fanDrag(layout: ScheduleMapFanLayout, center: Int) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                guard !closing else { return }
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    if dragStartIndex == nil {
                        dragStartIndex = index
                        dragStartedAt = value.time
                    }
                    dragActive = true
                    index = applyScheduleMapFanDrag(
                        index: dragStartIndex ?? index,
                        dx: Double(value.translation.width),
                        count: cluster.items.count
                    )
                }
            }
            .onEnded { value in
                let start = dragStartIndex ?? index
                let startedAt = dragStartedAt
                dragStartIndex = nil
                dragStartedAt = nil
                dragActive = false
                guard !closing else { return }
                let dx = Double(value.translation.width)
                let dy = Double(value.translation.height)
                let elapsed = startedAt.map { value.time.timeIntervalSince($0) } ?? 0
                let dt = max(0.001, elapsed)
                let vx = dx / dt
                let vy = dy / dt
                if isScheduleMapFanDismissFlick(vx: vx, vy: vy) {
                    beginClose(onDismiss)
                    return
                }
                if isScheduleMapFanTap(dx: dx, dy: dy, speed: hypot(vx, vy)) {
                    if let hit = tappedItemIndex(at: value.location, layout: layout) {
                        if hit == center {
                            if cluster.items.indices.contains(hit) {
                                let item = cluster.items[hit]
                                beginClose { onSelect(item) }
                            }
                        } else {
                            withAnimation(.easeOut(duration: 0.22)) {
                                index = Double(hit)
                            }
                        }
                    } else {
                        beginClose(onDismiss)
                    }
                    return
                }
                let snapped = snapScheduleMapFanIndex(
                    index: applyScheduleMapFanDrag(index: start, dx: dx, count: cluster.items.count),
                    vx: vx,
                    count: cluster.items.count
                )
                withAnimation(.easeOut(duration: 0.22)) {
                    index = Double(snapped)
                }
            }
    }

    private func tappedItemIndex(at point: CGPoint, layout: ScheduleMapFanLayout) -> Int? {
        var best: (index: Int, z: Double)?
        for itemIndex in cluster.items.indices {
            let offset = Double(itemIndex) - index
            guard scheduleMapFanSlot(offset: offset) != nil else { continue }
            let card = scheduleMapFanCardOffset(indexOffset: offset, layout: layout)
            let rect = CGRect(
                x: origin.x + layout.shiftX + card.x - 100,
                y: origin.y + card.y,
                width: 200,
                height: CGFloat(scheduleMapFanCardHeight)
            )
            guard rect.contains(point) else { continue }
            let z = 20 - abs(offset) * 10
            if best == nil || z > best!.z {
                best = (itemIndex, z)
            }
        }
        return best?.index
    }

    private func beginClose(_ action: @escaping () -> Void) {
        guard !closing else { return }
        closing = true
        presented = false
        onCloseStart()
        let wait = scheduleMapFanCloseTotalSeconds(count: cluster.items.count)
        closeTask?.cancel()
        closeTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard !Task.isCancelled else { return }
            action()
        }
    }

    private func fanCard(item: ScheduleMapItem, itemIndex: Int) -> some View {
        let style = SchedulePriorityStyle(
            priority: item.priority,
            colorScheme: colorScheme,
            isCompleted: isCalendarTaskCompleted(item.status)
        )
        let time = scheduleMapTimeLabel(startAt: item.startAt, endAt: item.endAt)
        let status = scheduleMapStatusLabel(item.status)
        return VStack(alignment: .leading, spacing: 2) {
            Text(item.title).font(.caption.weight(.semibold)).foregroundStyle(style.foreground).lineLimit(1)
            Text(time).font(.caption2).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
            Text(status).font(.caption2).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(width: 200, height: CGFloat(scheduleMapFanCardHeight), alignment: .topLeading)
        .background(style.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(style.accent.opacity(0.55), lineWidth: 1)
        )
        .accessibilityLabel("第 \(itemIndex + 1) 张，共 \(cluster.items.count) 张，\(item.title)，\(time)，\(status)")
    }
}
