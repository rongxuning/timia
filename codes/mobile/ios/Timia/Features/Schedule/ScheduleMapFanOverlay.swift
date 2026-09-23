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
    @State private var dragStartedAt: Date?
    @State private var dragActive = false
    @State private var revealed = false

    var body: some View {
        let count = cluster.items.count
        let center = min(max(0, count - 1), max(0, Int(index.rounded())))
        let selected = cluster.items.indices.contains(center) ? cluster.items[center] : nil
        let side = scheduleMapReelSide(originX: Double(origin.x), canvasWidth: Double(canvas.width))
        let cardHalf = scheduleMapCardWidth / 2
        let reelCenterX = side == "left"
            ? -(cardHalf + scheduleMapReelGap + scheduleMapReelTile / 2)
            : cardHalf + scheduleMapReelGap + scheduleMapReelTile / 2
        let anchor = scheduleMapAnchorOffsets()
        let cardTop = anchor.cardTop
        let cardMidY = cardTop + scheduleMapCardHeight / 2
        let tileAnimation: Animation? = dragActive
            ? nil
            : .easeOut(duration: revealed ? scheduleMapReelSnapSeconds : scheduleMapReelOpenSeconds)
        ZStack(alignment: .topLeading) {
            Color.clear
            ForEach(Array(cluster.items.enumerated()), id: \.element.id) { itemIndex, item in
                if let slot = scheduleMapReelPresentedSlot(offset: Double(itemIndex) - index, revealed: revealed) {
                    reelTile(item: item, itemIndex: itemIndex)
                        .scaleEffect(slot.scale)
                        .opacity(slot.opacity)
                        .offset(
                            x: origin.x + CGFloat(reelCenterX) - CGFloat(scheduleMapReelTile / 2),
                            y: origin.y + CGFloat(cardMidY + slot.y) - CGFloat(scheduleMapReelTile / 2)
                        )
                        .zIndex(10 - abs(Double(itemIndex) - index) * 10)
                        .allowsHitTesting(false)
                        .animation(tileAnimation, value: index)
                        .animation(tileAnimation, value: revealed)
                }
            }
            if let selected {
                selectedCard(selected, count: count)
                    .offset(x: origin.x - CGFloat(scheduleMapCardWidth / 2), y: origin.y + CGFloat(cardTop))
                    .zIndex(30)
                    .allowsHitTesting(false)
            }
            Circle()
                .fill(selectedAccent(selected))
                .frame(width: CGFloat(anchor.pinSize), height: CGFloat(anchor.pinSize))
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .shadow(color: selectedAccent(selected).opacity(0.35), radius: 3, y: 1)
                .offset(
                    x: origin.x - CGFloat(anchor.pinSize / 2),
                    y: origin.y + CGFloat(anchor.pinTop)
                )
                .allowsHitTesting(false)
        }
        .frame(width: canvas.width, height: canvas.height, alignment: .topLeading)
        .contentShape(Rectangle())
        .gesture(reelDrag(center: center, reelCenterX: reelCenterX, cardMidY: cardMidY, cardTop: cardTop))
        .onAppear {
            revealed = false
            DispatchQueue.main.async {
                withAnimation(.easeOut(duration: scheduleMapReelOpenSeconds)) {
                    revealed = true
                }
            }
        }
    }

    private func selectedAccent(_ item: ScheduleMapItem?) -> Color {
        let style = SchedulePriorityStyle(
            priority: item?.priority,
            colorScheme: colorScheme,
            isCompleted: isCalendarTaskCompleted(item?.status ?? "")
        )
        return style.accent
    }

    private func reelDrag(center: Int, reelCenterX: Double, cardMidY: Double, cardTop: Double) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
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
                        dx: Double(value.translation.height),
                        count: cluster.items.count,
                        step: scheduleMapReelStepPx
                    )
                }
            }
            .onEnded { value in
                let start = dragStartIndex ?? index
                let startedAt = dragStartedAt
                dragStartIndex = nil
                dragStartedAt = nil
                dragActive = false
                let dx = Double(value.translation.width)
                let dy = Double(value.translation.height)
                let elapsed = startedAt.map { value.time.timeIntervalSince($0) } ?? 0
                let dt = max(0.001, elapsed)
                let vx = dx / dt
                let vy = dy / dt
                if isScheduleMapFanTap(dx: dx, dy: dy, speed: hypot(vx, vy)) {
                    if let hit = tappedReelIndex(at: value.location, reelCenterX: reelCenterX, cardMidY: cardMidY) {
                        withAnimation(.easeOut(duration: scheduleMapReelSnapSeconds)) { index = Double(hit) }
                        return
                    }
                    if tappedSelectedCard(at: value.location, cardTop: cardTop), cluster.items.indices.contains(center) {
                        onSelect(cluster.items[center])
                        return
                    }
                    onDismiss()
                    return
                }
                let snapped = snapScheduleMapFanIndex(
                    index: applyScheduleMapFanDrag(
                        index: start,
                        dx: dy,
                        count: cluster.items.count,
                        step: scheduleMapReelStepPx
                    ),
                    vx: vy,
                    count: cluster.items.count
                )
                withAnimation(.easeOut(duration: scheduleMapReelSnapSeconds)) {
                    index = Double(snapped)
                }
            }
    }

    private func tappedReelIndex(at point: CGPoint, reelCenterX: Double, cardMidY: Double) -> Int? {
        for itemIndex in cluster.items.indices {
            guard let slot = scheduleMapReelSlot(offset: Double(itemIndex) - index) else { continue }
            let rect = CGRect(
                x: origin.x + CGFloat(reelCenterX) - CGFloat(scheduleMapReelTile / 2),
                y: origin.y + CGFloat(cardMidY + slot.y) - CGFloat(scheduleMapReelTile / 2),
                width: CGFloat(scheduleMapReelTile),
                height: CGFloat(scheduleMapReelTile)
            )
            if rect.contains(point) { return itemIndex }
        }
        return nil
    }

    private func tappedSelectedCard(at point: CGPoint, cardTop: Double) -> Bool {
        CGRect(
            x: origin.x - CGFloat(scheduleMapCardWidth / 2),
            y: origin.y + CGFloat(cardTop),
            width: CGFloat(scheduleMapCardWidth),
            height: CGFloat(scheduleMapCardHeight)
        )
        .contains(point)
    }

    private func reelTile(item: ScheduleMapItem, itemIndex: Int) -> some View {
        let style = SchedulePriorityStyle(
            priority: item.priority,
            colorScheme: colorScheme,
            isCompleted: isCalendarTaskCompleted(item.status)
        )
        let time = scheduleMapTimeLabel(startAt: item.startAt, endAt: item.endAt)
        return VStack(alignment: .leading, spacing: 2) {
            Text(item.title).font(.system(size: 11, weight: .semibold)).foregroundStyle(style.foreground).lineLimit(2)
            Text(time).font(.system(size: 10)).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
        }
        .padding(6)
        .frame(width: CGFloat(scheduleMapReelTile), height: CGFloat(scheduleMapReelTile), alignment: .topLeading)
        .background(style.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(style.accent.opacity(0.55), lineWidth: 1)
        )
        .accessibilityLabel("第 \(itemIndex + 1) 张，共 \(cluster.items.count) 张，\(item.title)，\(time)")
    }

    private func selectedCard(_ item: ScheduleMapItem, count: Int) -> some View {
        let style = SchedulePriorityStyle(
            priority: item.priority,
            colorScheme: colorScheme,
            isCompleted: isCalendarTaskCompleted(item.status)
        )
        let time = scheduleMapTimeLabel(startAt: item.startAt, endAt: item.endAt)
        let status = scheduleMapStatusLabel(item.status)
        let badge = scheduleMapCountDisplay(count)
        return ScheduleMapTaskCardFace(
            title: item.title,
            timeLabel: time,
            statusLabel: status,
            locationLabel: item.location?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            badge: badge,
            background: style.background,
            accent: style.accent,
            foreground: style.foreground
        )
        .accessibilityLabel("\(item.title)，\(time)，\(status)")
    }
}
