import ActivityKit
import Foundation

/// Starts, updates, and ends the Timia lock-screen Live Activity.
@MainActor
final class ScreenNotificationManager: ObservableObject {
    static let shared = ScreenNotificationManager()

    @Published private(set) var isActivityActive = false
    @Published private(set) var lastError: String?

    private var activity: Activity<TimiaScreenActivityAttributes>?
    private var refreshTask: Task<Void, Never>?

    private init() {
        activity = Activity<TimiaScreenActivityAttributes>.activities.first
        isActivityActive = activity != nil
    }

    var preference: ScreenNotificationPreference {
        get { ScreenNotificationPreference.current }
        set {
            ScreenNotificationPreference.current = newValue
            objectWillChange.send()
        }
    }

    func applyPreference(_ value: ScreenNotificationPreference, api: APIClient?) async {
        preference = value
        switch value {
        case .allowed:
            guard let api else { return }
            await startOrUpdate(api: api)
            startPeriodicRefresh(api: api)
        case .denied, .unset:
            refreshTask?.cancel()
            refreshTask = nil
            await endActivity()
        }
    }

    func startIfAllowed(api: APIClient) async {
        guard preference == .allowed else { return }
        await startOrUpdate(api: api)
        startPeriodicRefresh(api: api)
    }

    func refresh(api: APIClient) async {
        guard preference == .allowed else { return }
        await startOrUpdate(api: api)
    }

    func endActivity() async {
        guard let activity else {
            isActivityActive = false
            return
        }
        let finalState = activity.content.state
        await activity.end(
            ActivityContent(state: finalState, staleDate: nil),
            dismissalPolicy: .immediate
        )
        self.activity = nil
        isActivityActive = false
    }

    private func startPeriodicRefresh(api: APIClient) {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled else { break }
                await self?.startOrUpdate(api: api)
            }
        }
    }

    private func startOrUpdate(api: APIClient) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            lastError = "系统未开启实时活动，请在设置中允许 Timia 使用实时活动。"
            return
        }

        let state: TimiaScreenActivityAttributes.ContentState
        do {
            state = try await buildContentState(api: api)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
            state = ScreenNotificationContentBuilder.makeContentState(
                healthEnabled: HealthPermissionManager.shared.didRequest,
                lastSyncedAt: HealthSyncService.cachedLastSyncedAt(),
                todos: []
            )
        }

        if let activity {
            await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(15 * 60)))
            isActivityActive = true
            return
        }

        let attributes = TimiaScreenActivityAttributes(title: "Timia")
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(15 * 60)),
                pushType: nil
            )
            self.activity = activity
            isActivityActive = true
        } catch {
            lastError = error.localizedDescription
            isActivityActive = false
        }
    }

    private func buildContentState(api: APIClient) async throws -> TimiaScreenActivityAttributes.ContentState {
        let healthEnabled = HealthPermissionManager.shared.didRequest
        let lastSyncedAt = HealthSyncService.cachedLastSyncedAt()
        let todos = try await fetchTodayAllDayTodos(api: api)
        return ScreenNotificationContentBuilder.makeContentState(
            healthEnabled: healthEnabled,
            lastSyncedAt: lastSyncedAt,
            todos: todos
        )
    }

    private func fetchTodayAllDayTodos(api: APIClient) async throws -> [ScheduleTask] {
        let calendar = try await api.request(
            "/views/schedule/calendar",
            query: [
                URLQueryItem(name: "scope", value: "me"),
                URLQueryItem(name: "view", value: "day"),
                URLQueryItem(name: "anchor", value: ScreenNotificationContentBuilder.dayKey(Date())),
            ],
            response: ScheduleCalendar.self
        )
        return calendar.day?.items ?? []
    }
}
