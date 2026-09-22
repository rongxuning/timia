import MapKit
import SwiftUI

struct ScheduleMapView: View {
    @EnvironmentObject private var session: AppSession

    var refreshNonce: Int = 0
    var onTaskTap: (ScheduleTask) -> Void

    @State private var filters = ScheduleMapFilters.default
    @State private var workspaces: [WorkspaceCard] = []
    @State private var projects: [Project] = []
    @State private var response: ScheduleMapViewResponse?
    @State private var isLoading = false
    @State private var cameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 35, longitude: 105),
            span: MKCoordinateSpan(latitudeDelta: 35, longitudeDelta: 40)
        )
    )
    @State private var openClusterId: String?
    @State private var openItemIds: [String] = []
    @State private var fanIndex: Double = 0
    @State private var fanClosing = false
    @State private var loadGeneration = 0
    @State private var didFitCameraForFingerprint: String?
    @State private var loadError: String?

    private var items: [ScheduleMapItem] { response?.items ?? [] }
    private var clusters: [ScheduleMapTaskCluster] {
        clusterScheduleMapItems(items, now: Date(), placeFallback: "这个地点")
    }

    /// Same identity as Web `findScheduleMapClusterByItemIds`: the sorted item-id set, not `cluster.id`.
    private var openCluster: ScheduleMapTaskCluster? {
        guard openClusterId != nil, !openItemIds.isEmpty else { return nil }
        return clusters.first { scheduleMapItemIdSet($0.items) == openItemIds }
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            ZStack {
                mapCanvas
                    .opacity(isLoading && response == nil ? 0.55 : 1)

                if isLoading, response == nil, loadError == nil {
                    ProgressView("正在加载地图…")
                }

                if let canvasMessage {
                    Text(canvasMessage)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 14)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .padding(.horizontal, 24)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task(id: refreshNonce) {
            await loadWorkspaces()
            await loadMap()
        }
        .onChange(of: filters) { _, _ in
            Task { await loadMap() }
        }
        .onChange(of: filters.workspaceId) { _, workspaceId in
            Task { await loadProjects(workspaceId: workspaceId) }
        }
        .onChange(of: items) { _, _ in
            syncOpenFan()
        }
    }

    private var filterBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            filterRow(label: ScheduleMapFilterBarLayout.statusLabel) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(ScheduleMapStatus.allCases) { status in
                            let selected = filters.statuses.contains(status)
                            Button {
                                filters.statuses = toggleMapStatus(filters.statuses, status)
                            } label: {
                                Text(status.label)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(selected ? TimiaTheme.primary : .secondary)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 7)
                                    .background(
                                        Capsule()
                                            .fill(selected ? TimiaTheme.primary.opacity(0.12) : TimiaTheme.field)
                                    )
                                    .overlay(
                                        Capsule()
                                            .stroke(selected ? TimiaTheme.primary.opacity(0.55) : TimiaTheme.border.opacity(0.6))
                                    )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(status.label)
                            .accessibilityAddTraits(selected ? .isSelected : [])
                        }
                    }
                }
            }

            filterRow(label: ScheduleMapFilterBarLayout.scopeLabel) {
                HStack(spacing: 8) {
                    filterMenu(
                        accessibilityLabel: "空间",
                        selectionLabel: workspaceLabel,
                        options: [("全部空间", nil as String?)] + workspaces.map { ($0.name, $0.id as String?) },
                        onSelect: { value in
                            filters = setMapWorkspace(filters, workspaceId: value)
                        }
                    )
                    filterMenu(
                        accessibilityLabel: "项目",
                        selectionLabel: projectLabel,
                        options: [("全部项目", nil as String?)] + projects.map { ($0.name, $0.id as String?) },
                        disabled: !filters.isProjectFilterEnabled,
                        onSelect: { value in
                            filters = setMapProject(filters, projectId: value)
                        }
                    )
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 52)
        .padding(.top, 4)
        .padding(.bottom, 10)
        .background(TimiaTheme.surface)
        .overlay(alignment: .topTrailing) {
            if let response {
                Text("\(response.items.count)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(TimiaTheme.primary)
                    .padding(.horizontal, 8)
                    .frame(minWidth: 32, minHeight: 32)
                    .background(TimiaTheme.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .padding(.trailing, 16)
                    .padding(.top, 4)
                    .accessibilityLabel(placeCountLabel(response))
            }
        }
    }

    private func filterRow<Content: View>(
        label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: CGFloat(ScheduleMapFilterBarLayout.labelColumnWidth), alignment: .leading)
            content()
        }
        .frame(minHeight: CGFloat(ScheduleMapFilterBarLayout.rowMinHeight), alignment: .center)
    }

    private var mapCanvas: some View {
        MapReader { proxy in
            Map(position: $cameraPosition, interactionModes: openClusterId == nil ? .all : []) {
                ForEach(clusters) { cluster in
                    if cluster.items.count == 1, let anchor = cluster.items.first {
                        singlePin(anchor)
                    } else if cluster.items.count >= 2 {
                        chestPin(cluster)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapCompass()
                MapScaleView()
            }
            .overlay {
                if let cluster = openCluster {
                    fanOverlay(cluster: cluster, proxy: proxy)
                }
            }
        }
    }

    private func singlePin(_ anchor: ScheduleMapItem) -> some MapContent {
        let copy = scheduleMapPinCopy(
            title: anchor.title,
            extraCount: 1,
            startAt: anchor.startAt,
            endAt: anchor.endAt,
            status: anchor.status
        )
        return Annotation(
            copy.title,
            coordinate: ChinaCoordinate.mapKitCoordinate(lat: anchor.locationLat, lng: anchor.locationLng),
            anchor: .bottom
        ) {
            Button {
                onTaskTap(anchor.asScheduleTask())
            } label: {
                ScheduleMapPinLabel(
                    title: copy.title,
                    timeLabel: copy.timeLabel,
                    statusLabel: copy.statusLabel,
                    priority: anchor.priority,
                    isCompleted: isCalendarTaskCompleted(anchor.status)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func chestPin(_ cluster: ScheduleMapTaskCluster) -> some MapContent {
        Annotation(
            cluster.placeTitle,
            coordinate: ChinaCoordinate.mapKitCoordinate(lat: cluster.locationLat, lng: cluster.locationLng),
            anchor: .bottom
        ) {
            Button {
                fanClosing = false
                openClusterId = cluster.id
                openItemIds = scheduleMapItemIdSet(cluster.items)
                fanIndex = Double(scheduleMapClusterFocusIndex(cluster.items, now: Date()))
            } label: {
                ScheduleMapChestLabel(
                    placeTitle: cluster.placeTitle,
                    count: cluster.items.count,
                    isExpanded: !fanClosing && scheduleMapItemIdSet(cluster.items) == openItemIds
                )
            }
            .buttonStyle(.plain)
        }
    }

    /// `MapProxy` points are in global space. The fan's offsets are local to this overlay, so the origin is translated by the overlay's global frame. A nil convert means the point is not on screen yet — render nothing rather than a fake center.
    private func fanOverlay(cluster: ScheduleMapTaskCluster, proxy: MapProxy) -> some View {
        GeometryReader { geo in
            let coordinate = ChinaCoordinate.mapKitCoordinate(lat: cluster.locationLat, lng: cluster.locationLng)
            let frame = geo.frame(in: .global)
            if let global = proxy.convert(coordinate, to: .global) {
                ScheduleMapFanOverlay(
                    cluster: cluster,
                    origin: CGPoint(x: global.x - frame.minX, y: global.y - frame.minY),
                    canvas: geo.size,
                    index: $fanIndex,
                    onCloseStart: { fanClosing = true },
                    onSelect: { item in
                        openClusterId = nil
                        openItemIds = []
                        fanClosing = false
                        onTaskTap(item.asScheduleTask())
                    },
                    onDismiss: {
                        openClusterId = nil
                        openItemIds = []
                        fanClosing = false
                    }
                )
            }
        }
    }

    private var canvasMessage: String? {
        scheduleMapCanvasMessage(
            isLoading: isLoading,
            loadError: loadError,
            hasResponse: response != nil,
            itemCount: items.count,
            isDefaultFilters: filters.isDefault
        )
    }

    private var workspaceLabel: String {
        guard let workspaceId = filters.workspaceId,
              let name = workspaces.first(where: { $0.id == workspaceId })?.name else {
            return "全部空间"
        }
        return name
    }

    private var projectLabel: String {
        guard filters.isProjectFilterEnabled else { return "全部项目" }
        guard let projectId = filters.projectId,
              let name = projects.first(where: { $0.id == projectId })?.name else {
            return "全部项目"
        }
        return name
    }

    private func filterMenu(
        accessibilityLabel: String,
        selectionLabel: String,
        options: [(String, String?)],
        disabled: Bool = false,
        onSelect: @escaping (String?) -> Void
    ) -> some View {
        Menu {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                Button(option.0) { onSelect(option.1) }
            }
        } label: {
            HStack(spacing: 4) {
                Text(selectionLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(disabled ? Color.secondary.opacity(0.6) : Color.primary)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(TimiaTheme.field, in: Capsule())
            .overlay(Capsule().stroke(TimiaTheme.border.opacity(0.55)))
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(selectionLabel)
        .disabled(disabled)
    }

    private func placeCountLabel(_ response: ScheduleMapViewResponse) -> String {
        if response.truncated {
            return "前 \(response.items.count) 个地点"
        }
        return "\(response.total) 个地点"
    }

    private func loadWorkspaces() async {
        do {
            workspaces = try await session.api.request("/workspaces/cards", response: [WorkspaceCard].self)
        } catch {
            workspaces = []
        }
    }

    private func loadProjects(workspaceId: String?) async {
        guard let workspaceId, !workspaceId.isEmpty else {
            projects = []
            return
        }
        do {
            projects = try await session.api.request(
                "/workspaces/\(workspaceId)/projects",
                response: [Project].self
            )
        } catch {
            projects = []
        }
    }

    private func loadMap() async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        loadError = nil
        defer {
            if generation == loadGeneration {
                isLoading = false
            }
        }
        do {
            let result: ScheduleMapViewResponse = try await session.api.request(
                "/views/schedule/map",
                query: scheduleMapQueryItems(filters: filters),
                response: ScheduleMapViewResponse.self
            )
            guard generation == loadGeneration else { return }
            response = result
            loadError = nil
            syncOpenFan()
            fitCameraIfNeeded(for: result.items)
        } catch {
            guard generation == loadGeneration else { return }
            loadError = scheduleMapLoadFailureMessage(error)
        }
    }

    private func fitCameraIfNeeded(for items: [ScheduleMapItem]) {
        guard openClusterId == nil else { return }
        let fingerprint = items
            .map { scheduleMapCoordinateKey(lat: $0.locationLat, lng: $0.locationLng) }
            .sorted()
            .joined(separator: "|")
        guard fingerprint != didFitCameraForFingerprint else { return }
        didFitCameraForFingerprint = fingerprint

        guard !items.isEmpty else {
            cameraPosition = .region(
                MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: 35, longitude: 105),
                    span: MKCoordinateSpan(latitudeDelta: 35, longitudeDelta: 40)
                )
            )
            return
        }

        if items.count == 1, let only = items.first {
            cameraPosition = .region(
                MKCoordinateRegion(
                    center: ChinaCoordinate.mapKitCoordinate(lat: only.locationLat, lng: only.locationLng),
                    span: MKCoordinateSpan(latitudeDelta: 0.04, longitudeDelta: 0.04)
                )
            )
            return
        }

        let displayed = items.map {
            ChinaCoordinate.wgs84ToGcj02(lat: $0.locationLat, lng: $0.locationLng)
        }
        let lats = displayed.map(\.lat)
        let lngs = displayed.map(\.lng)
        let minLat = lats.min() ?? 0
        let maxLat = lats.max() ?? 0
        let minLng = lngs.min() ?? 0
        let maxLng = lngs.max() ?? 0
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2
        )
        let latDelta = max(0.05, (maxLat - minLat) * 1.45)
        let lngDelta = max(0.05, (maxLng - minLng) * 1.45)
        cameraPosition = .region(
            MKCoordinateRegion(
                center: center,
                span: MKCoordinateSpan(latitudeDelta: latDelta, longitudeDelta: lngDelta)
            )
        )
    }

    private func syncOpenFan() {
        guard openClusterId != nil else { return }
        guard !openItemIds.isEmpty,
              let match = clusters.first(where: { scheduleMapItemIdSet($0.items) == openItemIds }) else {
            openClusterId = nil
            openItemIds = []
            return
        }
        openClusterId = match.id
        let maxIndex = Double(max(0, match.items.count - 1))
        fanIndex = min(max(fanIndex, 0), maxIndex)
    }
}

private func scheduleMapItemIdSet(_ items: [ScheduleMapItem]) -> [String] {
    items.map(\.id).sorted()
}

private struct ScheduleMapPinLabel: View {
    @Environment(\.colorScheme) private var colorScheme

    let title: String
    let timeLabel: String
    let statusLabel: String
    let priority: String?
    let isCompleted: Bool

    var body: some View {
        let style = SchedulePriorityStyle(
            priority: priority,
            colorScheme: colorScheme,
            isCompleted: isCompleted
        )
        VStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(style.foreground)
                    .lineLimit(1)
                Text(timeLabel)
                    .font(.caption2)
                    .foregroundStyle(style.foreground.opacity(0.82))
                    .lineLimit(1)
                Text(statusLabel)
                    .font(.caption2)
                    .foregroundStyle(style.foreground.opacity(0.82))
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(style.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(style.accent.opacity(0.55), lineWidth: 1)
            )

            Circle()
                .fill(style.accent)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .shadow(color: style.accent.opacity(0.35), radius: 3, y: 1)
        }
    }
}
