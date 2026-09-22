import Foundation

enum ScheduleMapStatus: String, CaseIterable, Identifiable, Sendable {
    case todo
    case doing
    case done
    case archived

    var id: String { rawValue }

    var label: String {
        switch self {
        case .todo: return "未开始"
        case .doing: return "进行中"
        case .done: return "已完成"
        case .archived: return "已归档"
        }
    }
}

struct ScheduleMapPinCopy: Equatable {
    let title: String
    let timeLabel: String
    let statusLabel: String
}

func scheduleMapStatusLabel(_ status: String) -> String {
    ScheduleMapStatus(rawValue: status)?.label ?? status
}

func scheduleMapPinCopy(
    title: String,
    extraCount: Int,
    startAt: String?,
    endAt: String?,
    status: String
) -> ScheduleMapPinCopy {
    ScheduleMapPinCopy(
        title: extraCount > 1 ? "\(title) 等\(extraCount)项" : title,
        timeLabel: scheduleMapTimeLabel(startAt: startAt, endAt: endAt),
        statusLabel: scheduleMapStatusLabel(status)
    )
}

struct ScheduleMapFilters: Equatable, Sendable {
    var statuses: [ScheduleMapStatus]
    var workspaceId: String?
    var projectId: String?

    static let `default` = ScheduleMapFilters(
        statuses: [.todo, .doing],
        workspaceId: nil,
        projectId: nil
    )

    var isProjectFilterEnabled: Bool {
        !(workspaceId ?? "").isEmpty
    }

    var isDefault: Bool {
        workspaceId == nil
            && projectId == nil
            && statuses.count == Self.default.statuses.count
            && Set(statuses) == Set(Self.default.statuses)
    }
}

func toggleMapStatus(_ statuses: [ScheduleMapStatus], _ key: ScheduleMapStatus) -> [ScheduleMapStatus] {
    if statuses.contains(key) {
        if statuses.count <= 1 { return statuses }
        return statuses.filter { $0 != key }
    }
    var next = statuses
    next.append(key)
    return ScheduleMapStatus.allCases.filter { next.contains($0) }
}

func setMapWorkspace(_ filters: ScheduleMapFilters, workspaceId: String?) -> ScheduleMapFilters {
    var next = filters
    let trimmed = workspaceId?.trimmingCharacters(in: .whitespacesAndNewlines)
    next.workspaceId = (trimmed?.isEmpty == false) ? trimmed : nil
    next.projectId = nil
    return next
}

func setMapProject(_ filters: ScheduleMapFilters, projectId: String?) -> ScheduleMapFilters {
    var next = filters
    guard next.isProjectFilterEnabled else {
        next.projectId = nil
        return next
    }
    let trimmed = projectId?.trimmingCharacters(in: .whitespacesAndNewlines)
    next.projectId = (trimmed?.isEmpty == false) ? trimmed : nil
    return next
}

func scheduleMapQueryItems(filters: ScheduleMapFilters, limit: Int = 500) -> [URLQueryItem] {
    var items = [
        URLQueryItem(name: "scope", value: "me"),
        URLQueryItem(name: "limit", value: String(limit)),
    ]
    for status in filters.statuses {
        items.append(URLQueryItem(name: "status", value: status.rawValue))
    }
    if let workspaceId = filters.workspaceId {
        items.append(URLQueryItem(name: "workspace_id", value: workspaceId))
    }
    if let projectId = filters.projectId {
        items.append(URLQueryItem(name: "project_id", value: projectId))
    }
    return items
}

func scheduleMapCoordinateKey(lat: Double, lng: Double) -> String {
    String(format: "%.6f,%.6f", lat, lng)
}

enum ScheduleMapFilterBarLayout {
    static let statusLabel = "状态"
    static let scopeLabel = "范围"
    static let labelColumnWidth: Double = 40
    static let rowMinHeight: Double = 32
}

func scheduleMapLoadFailureMessage(_ error: Error) -> String {
    if let api = error as? APIError, api.isNotFound {
        return "无法加载地图任务"
    }
    return (error as? LocalizedError)?.errorDescription ?? "无法加载地图任务"
}

func scheduleMapCanvasMessage(
    isLoading: Bool,
    loadError: String?,
    hasResponse: Bool,
    itemCount: Int,
    isDefaultFilters: Bool
) -> String? {
    if let loadError, !loadError.isEmpty {
        return loadError
    }
    guard !isLoading, hasResponse, itemCount == 0 else { return nil }
    return isDefaultFilters
        ? "还没有带地点的任务。在网页添加任务并搜索地址后会出现在这里。"
        : "没有符合筛选条件的地点任务。"
}

func groupScheduleMapItemsByCoordinate(_ items: [ScheduleMapItem]) -> [[ScheduleMapItem]] {
    var order: [String] = []
    var buckets: [String: [ScheduleMapItem]] = [:]
    for item in items {
        let key = scheduleMapCoordinateKey(lat: item.locationLat, lng: item.locationLng)
        if buckets[key] == nil {
            order.append(key)
            buckets[key] = []
        }
        buckets[key, default: []].append(item)
    }
    return order.compactMap { buckets[$0] }
}

func scheduleMapTimeLabel(startAt: String?, endAt: String?) -> String {
    guard let start = scheduleMapParseISO(startAt) else { return "未排期" }
    let dayFormatter = DateFormatter()
    dayFormatter.locale = Locale(identifier: "zh_CN")
    dayFormatter.dateFormat = "M月d日 HH:mm"
    guard let end = scheduleMapParseISO(endAt) else {
        return dayFormatter.string(from: start)
    }
    if Calendar.current.isDate(start, inSameDayAs: end) {
        let timeFormatter = DateFormatter()
        timeFormatter.locale = Locale(identifier: "zh_CN")
        timeFormatter.dateFormat = "HH:mm"
        return "\(dayFormatter.string(from: start)) – \(timeFormatter.string(from: end))"
    }
    return "\(dayFormatter.string(from: start)) – \(dayFormatter.string(from: end))"
}

func scheduleMapParseISO(_ value: String?) -> Date? {
    guard let value, !value.isEmpty else { return nil }
    let withFractional = ISO8601DateFormatter()
    withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFractional.date(from: value) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
}
