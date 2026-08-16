import Foundation

protocol PinnableTag: Identifiable {
    var isFavorite: Bool { get }
    var createdAt: String { get }
}

struct PinnedTagItem: Identifiable, Hashable, Sendable, PinnableTag {
    let id: String
    let label: String
    var hint: String? = nil
    let isFavorite: Bool
    let createdAt: String
}

func sortFavoriteThenCreatedAt<T: PinnableTag>(_ items: [T]) -> [T] where T.ID == String {
    items.sorted { left, right in
        if left.isFavorite != right.isFavorite {
            return left.isFavorite && !right.isFavorite
        }
        let leftTime = parsedCreatedAt(left.createdAt)
        let rightTime = parsedCreatedAt(right.createdAt)
        if leftTime != rightTime {
            return leftTime > rightTime
        }
        return left.id.localizedStandardCompare(right.id) == .orderedDescending
    }
}

func visiblePinnedTags<T: Identifiable>(
    _ sortedItems: [T],
    anchorId: String?,
    maxVisible: Int = 5
) -> [T] where T.ID == String {
    guard !sortedItems.isEmpty else { return [] }
    guard let anchorId, let anchor = sortedItems.first(where: { $0.id == anchorId }) else {
        return Array(sortedItems.prefix(maxVisible))
    }
    let rest = sortedItems.filter { $0.id != anchor.id }
    return Array(([anchor] + rest).prefix(maxVisible))
}

func nextPinnedAnchorId<T: Identifiable>(
    sortedItems: [T],
    selectedId: String?,
    currentAnchorId: String?
) -> String? where T.ID == String {
    guard !sortedItems.isEmpty else { return nil }
    let tiles = visiblePinnedTags(sortedItems, anchorId: currentAnchorId)
    let valueInOptions = selectedId.map { id in sortedItems.contains { $0.id == id } } ?? false
    let valueInTiles = selectedId.map { id in tiles.contains { $0.id == id } } ?? false
    if valueInOptions, !valueInTiles {
        return selectedId
    }
    if currentAnchorId == nil || !sortedItems.contains(where: { $0.id == currentAnchorId }) {
        return valueInOptions ? selectedId : sortedItems.first?.id
    }
    return currentAnchorId
}

private func parsedCreatedAt(_ value: String) -> TimeInterval {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return 0 }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: trimmed) {
        return date.timeIntervalSince1970
    }
    if let date = ISO8601DateFormatter().date(from: trimmed) {
        return date.timeIntervalSince1970
    }
    return 0
}

extension WorkspaceCard: PinnableTag {}
extension Project: PinnableTag {}
