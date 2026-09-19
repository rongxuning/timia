import MapKit
import SwiftUI

struct ScheduleMapView: View {
    @EnvironmentObject private var session: AppSession

    var refreshNonce: Int = 0
    var onTaskTap: (ScheduleTask) -> Void
    var onError: (String) -> Void

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
    @State private var clusteredSelection: [ScheduleMapItem]?
    @State private var loadGeneration = 0
    @State private var didFitCameraForFingerprint: String?

    private var items: [ScheduleMapItem] { response?.items ?? [] }
    private var clusters: [ScheduleMapCluster] {
        groupScheduleMapItemsByCoordinate(items).compactMap { group in
            guard let first = group.first else { return nil }
            return ScheduleMapCluster(
                id: scheduleMapCoordinateKey(lat: first.locationLat, lng: first.locationLng),
                items: group
            )
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            ZStack {
                mapCanvas
                    .opacity(isLoading && response == nil ? 0.55 : 1)

                if isLoading, response == nil {
                    ProgressView("正在加载地图…")
                }

                if let emptyMessage {
                    Text(emptyMessage)
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
        .confirmationDialog("选择任务", isPresented: Binding(
            get: { clusteredSelection != nil },
            set: { if !$0 { clusteredSelection = nil } }
        ), titleVisibility: .visible) {
            if let clusteredSelection {
                ForEach(clusteredSelection) { item in
                    Button("\(item.title) · \(scheduleMapTimeLabel(startAt: item.startAt, endAt: item.endAt))") {
                        onTaskTap(item.asScheduleTask())
                        self.clusteredSelection = nil
                    }
                }
            }
            Button("取消", role: .cancel) {
                clusteredSelection = nil
            }
        }
    }

    private var filterBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("状态")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
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

            HStack(spacing: 10) {
                filterMenu(
                    title: "空间",
                    selectionLabel: workspaceLabel,
                    options: [("全部空间", nil as String?)] + workspaces.map { ($0.name, $0.id as String?) },
                    onSelect: { value in
                        filters = setMapWorkspace(filters, workspaceId: value)
                    }
                )

                filterMenu(
                    title: "项目",
                    selectionLabel: projectLabel,
                    options: [("全部项目", nil as String?)] + projects.map { ($0.name, $0.id as String?) },
                    disabled: !filters.isProjectFilterEnabled,
                    onSelect: { value in
                        filters = setMapProject(filters, projectId: value)
                    }
                )

                Spacer(minLength: 0)

                if let response {
                    Text(placeCountLabel(response))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 10)
        .background(TimiaTheme.surface)
    }

    private var mapCanvas: some View {
        Map(position: $cameraPosition) {
            ForEach(clusters) { cluster in
                let anchor = cluster.items[0]
                Annotation(anchor.title, coordinate: CLLocationCoordinate2D(
                    latitude: anchor.locationLat,
                    longitude: anchor.locationLng
                )) {
                    Button {
                        if cluster.items.count == 1 {
                            onTaskTap(anchor.asScheduleTask())
                        } else {
                            clusteredSelection = cluster.items
                        }
                    } label: {
                        ScheduleMapPinLabel(
                            title: cluster.items.count == 1
                                ? anchor.title
                                : "\(anchor.title) 等\(cluster.items.count)项",
                            timeLabel: scheduleMapTimeLabel(startAt: anchor.startAt, endAt: anchor.endAt),
                            priority: anchor.priority,
                            isCompleted: isCalendarTaskCompleted(anchor.status)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .mapControls {
            MapCompass()
            MapScaleView()
        }
    }

    private var emptyMessage: String? {
        guard !isLoading, response != nil, items.isEmpty else { return nil }
        return filters.isDefault
            ? "还没有带地点的任务。在网页添加任务并搜索地址后会出现在这里。"
            : "没有符合筛选条件的地点任务。"
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
        title: String,
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
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(selectionLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(disabled ? .secondary.opacity(0.6) : .primary)
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
            fitCameraIfNeeded(for: result.items)
        } catch {
            guard generation == loadGeneration else { return }
            onError(error.localizedDescription)
        }
    }

    private func fitCameraIfNeeded(for items: [ScheduleMapItem]) {
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
                    center: CLLocationCoordinate2D(latitude: only.locationLat, longitude: only.locationLng),
                    span: MKCoordinateSpan(latitudeDelta: 0.04, longitudeDelta: 0.04)
                )
            )
            return
        }

        let lats = items.map(\.locationLat)
        let lngs = items.map(\.locationLng)
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
}

private struct ScheduleMapCluster: Identifiable {
    let id: String
    let items: [ScheduleMapItem]
}

private struct ScheduleMapPinLabel: View {
    let title: String
    let timeLabel: String
    let priority: String?
    let isCompleted: Bool

    var body: some View {
        let accent = SchedulePriorityAccent.color(for: priority, isCompleted: isCompleted)
        VStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(timeLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(accent.opacity(0.55), lineWidth: 1)
            )

            Circle()
                .fill(accent)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .shadow(color: accent.opacity(0.35), radius: 3, y: 1)
        }
    }
}
