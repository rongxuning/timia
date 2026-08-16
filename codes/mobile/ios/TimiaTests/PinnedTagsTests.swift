import XCTest
@testable import Timia

final class PinnedTagsTests: XCTestCase {
    private func item(
        _ id: String,
        favorite: Bool,
        createdAt: String,
        label: String? = nil
    ) -> PinnedTagItem {
        PinnedTagItem(
            id: id,
            label: label ?? id,
            isFavorite: favorite,
            createdAt: createdAt
        )
    }

    func testSortPutsFavoritesBeforeNewerNonFavorites() {
        let olderFavorite = item("fav", favorite: true, createdAt: "2026-01-01T00:00:00Z")
        let newerPlain = item("plain", favorite: false, createdAt: "2026-08-01T00:00:00Z")
        let out = sortFavoriteThenCreatedAt([newerPlain, olderFavorite])
        XCTAssertEqual(out.map(\.id), ["fav", "plain"])
    }

    func testSortPutsNewerFirstWhenFavoriteFlagMatches() {
        let older = item("old", favorite: false, createdAt: "2026-01-01T00:00:00Z")
        let newer = item("new", favorite: false, createdAt: "2026-08-01T00:00:00Z")
        let out = sortFavoriteThenCreatedAt([older, newer])
        XCTAssertEqual(out.map(\.id), ["new", "old"])
    }

    func testSortBreaksCreatedAtTiesByIdDescending() {
        let a = item("aaa", favorite: false, createdAt: "2026-08-01T00:00:00Z")
        let b = item("zzz", favorite: false, createdAt: "2026-08-01T00:00:00Z")
        let out = sortFavoriteThenCreatedAt([a, b])
        XCTAssertEqual(out.map(\.id), ["zzz", "aaa"])
    }

    func testVisibleTagsWithoutAnchorTakeFirstFive() {
        let items = (1...7).map { item("\($0)", favorite: false, createdAt: "2026-08-0\($0)T00:00:00Z") }
        let sorted = sortFavoriteThenCreatedAt(items)
        let visible = visiblePinnedTags(sorted, anchorId: nil)
        XCTAssertEqual(visible.map(\.id), ["7", "6", "5", "4", "3"])
    }

    func testVisibleTagsPinAnchorFirstThenFillFromSortedRest() {
        let items = (1...7).map { item("\($0)", favorite: false, createdAt: "2026-08-0\($0)T00:00:00Z") }
        let sorted = sortFavoriteThenCreatedAt(items)
        let visible = visiblePinnedTags(sorted, anchorId: "2")
        XCTAssertEqual(visible.map(\.id), ["2", "7", "6", "5", "4"])
    }

    func testVisibleTagsIgnoreMissingAnchor() {
        let items = (1...3).map { item("\($0)", favorite: false, createdAt: "2026-08-0\($0)T00:00:00Z") }
        let sorted = sortFavoriteThenCreatedAt(items)
        let visible = visiblePinnedTags(sorted, anchorId: "missing")
        XCTAssertEqual(visible.map(\.id), ["3", "2", "1"])
    }

    func testAnchorStaysWhenSelectingAVisibleTag() {
        let sorted = sortFavoriteThenCreatedAt(
            (1...7).map { item("\($0)", favorite: false, createdAt: "2026-08-0\($0)T00:00:00Z") }
        )
        let next = nextPinnedAnchorId(sortedItems: sorted, selectedId: "5", currentAnchorId: "7")
        XCTAssertEqual(next, "7")
    }

    func testAnchorMovesWhenSelectingAnItemOutsideTheTiles() {
        let sorted = sortFavoriteThenCreatedAt(
            (1...7).map { item("\($0)", favorite: false, createdAt: "2026-08-0\($0)T00:00:00Z") }
        )
        let next = nextPinnedAnchorId(sortedItems: sorted, selectedId: "2", currentAnchorId: "7")
        XCTAssertEqual(next, "2")
    }

    func testAnchorFallsBackToSelectionWhenCurrentAnchorLeavesTheList() {
        let sorted = sortFavoriteThenCreatedAt([
            item("keep", favorite: false, createdAt: "2026-08-02T00:00:00Z"),
            item("newer", favorite: false, createdAt: "2026-08-03T00:00:00Z")
        ])
        let next = nextPinnedAnchorId(sortedItems: sorted, selectedId: "keep", currentAnchorId: "gone")
        XCTAssertEqual(next, "keep")
    }

    func testAnchorFallsBackToFirstSortedItemWhenSelectionIsMissing() {
        let sorted = sortFavoriteThenCreatedAt([
            item("old", favorite: false, createdAt: "2026-08-01T00:00:00Z"),
            item("new", favorite: false, createdAt: "2026-08-02T00:00:00Z")
        ])
        let next = nextPinnedAnchorId(sortedItems: sorted, selectedId: nil, currentAnchorId: nil)
        XCTAssertEqual(next, "new")
    }

    func testEmptyListClearsAnchor() {
        XCTAssertNil(nextPinnedAnchorId(sortedItems: [PinnedTagItem](), selectedId: "any", currentAnchorId: "any"))
    }
}
