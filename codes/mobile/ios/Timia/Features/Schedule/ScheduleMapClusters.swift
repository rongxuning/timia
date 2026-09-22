import Foundation

let earthRadiusM = 6_371_000.0
let scheduleMapClusterRadiusM = 30.0

struct ScheduleMapTaskCluster: Identifiable, Equatable {
    let id: String
    let items: [ScheduleMapItem]
    let locationLat: Double
    let locationLng: Double
    let placeTitle: String
}

func haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double) -> Double {
    let dLat = (lat2 - lat1) * .pi / 180
    let dLng = (lng2 - lng1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2)
        + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * earthRadiusM * asin(min(1, sqrt(a)))
}

func sortScheduleMapClusterItems(_ items: [ScheduleMapItem]) -> [ScheduleMapItem] {
    let timed = items.filter(scheduleMapClusterIsTimed).sorted { left, right in
        let leftStart = left.startAt ?? ""
        let rightStart = right.startAt ?? ""
        if leftStart != rightStart { return leftStart < rightStart }
        let titleOrder = left.title.compare(right.title, locale: Locale(identifier: "zh"))
        if titleOrder != .orderedSame { return titleOrder == .orderedAscending }
        return left.id < right.id
    }
    return timed + items.filter { !scheduleMapClusterIsTimed($0) }
}

func scheduleMapClusterFocusIndex(_ items: [ScheduleMapItem], now: Date) -> Int {
    items.firstIndex { item in
        guard let date = scheduleMapParseISO(item.startAt) else { return false }
        return date >= now
    } ?? 0
}

func clusterScheduleMapItems(
    _ items: [ScheduleMapItem],
    now _: Date,
    placeFallback: String
) -> [ScheduleMapTaskCluster] {
    let buckets = groupScheduleMapItemsByCoordinate(items)
    var clusters: [(origin: (lat: Double, lng: Double), items: [ScheduleMapItem])] = []
    for bucket in buckets {
        guard let first = bucket.first else { continue }
        let origin = (lat: first.locationLat, lng: first.locationLng)
        var target: Int?
        var best = Double.greatestFiniteMagnitude
        for (index, cluster) in clusters.enumerated() {
            let fits = cluster.items.allSatisfy {
                haversineMeters(lat1: origin.lat, lng1: origin.lng, lat2: $0.locationLat, lng2: $0.locationLng)
                    <= scheduleMapClusterRadiusM
            }
            guard fits else { continue }
            let distance = haversineMeters(lat1: origin.lat, lng1: origin.lng, lat2: cluster.origin.lat, lng2: cluster.origin.lng)
            if distance < best {
                best = distance
                target = index
            }
        }
        if let target {
            clusters[target].items.append(contentsOf: bucket)
        } else {
            clusters.append((origin, bucket))
        }
    }
    return clusters.map { cluster in
        let sorted = sortScheduleMapClusterItems(cluster.items)
        let coord = majority(cluster.items) { scheduleMapCoordinateKey(lat: $0.locationLat, lng: $0.locationLng) }
        let names = cluster.items.compactMap { item -> String? in
            let trimmed = item.location?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? nil : trimmed
        }
        let placeTitle = names.isEmpty ? placeFallback : majority(names) { $0 }
        return ScheduleMapTaskCluster(
            id: scheduleMapCoordinateKey(lat: cluster.origin.lat, lng: cluster.origin.lng),
            items: sorted,
            locationLat: coord.locationLat,
            locationLng: coord.locationLng,
            placeTitle: placeTitle
        )
    }
}

private func scheduleMapClusterIsTimed(_ item: ScheduleMapItem) -> Bool {
    guard let startAt = item.startAt else { return false }
    return !startAt.isEmpty
}

private func majority<T>(_ values: [T], key: (T) -> String) -> T {
    var first: [String: T] = [:]
    var counts: [String: Int] = [:]
    var order: [String] = []
    for value in values {
        let group = key(value)
        if first[group] == nil {
            first[group] = value
            order.append(group)
        }
        counts[group, default: 0] += 1
    }
    var bestKey = order[0]
    var bestCount = -1
    for group in order {
        let count = counts[group] ?? 0
        if count > bestCount {
            bestKey = group
            bestCount = count
        }
    }
    return first[bestKey]!
}
