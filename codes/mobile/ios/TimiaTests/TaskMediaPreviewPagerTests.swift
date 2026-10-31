import XCTest
@testable import Timia

final class TaskMediaPreviewPagerTests: XCTestCase {
    func testSingleImageHasNoSentinel() {
        let pages = TaskMediaPreviewPager.pages(imageCount: 1)
        XCTAssertEqual(pages, [
            TaskMediaPreviewPage(selection: 0, imageIndex: 0, isSentinel: false)
        ])
        XCTAssertNil(TaskMediaPreviewPager.snapSelection(selection: 0, imageCount: 1))
        XCTAssertEqual(TaskMediaPreviewPager.initialSelection(startIndex: 0, imageCount: 1), 0)
        XCTAssertEqual(TaskMediaPreviewPager.selectionByMoving(0, offset: 1, imageCount: 1), 0)
        XCTAssertEqual(TaskMediaPreviewPager.selectionByMoving(0, offset: -1, imageCount: 1), 0)
    }

    func testMultipleImagesCloneBothEnds() {
        let pages = TaskMediaPreviewPager.pages(imageCount: 3)
        XCTAssertEqual(pages.map(\.selection), [0, 1, 2, 3, 4])
        XCTAssertEqual(pages.map(\.imageIndex), [2, 0, 1, 2, 0])
        XCTAssertEqual(pages.map(\.isSentinel), [true, false, false, false, true])
    }

    func testOpenedImageStartsOnItsRealPage() {
        XCTAssertEqual(TaskMediaPreviewPager.initialSelection(startIndex: 2, imageCount: 3), 3)
        XCTAssertEqual(TaskMediaPreviewPager.initialSelection(startIndex: -4, imageCount: 3), 1)
        XCTAssertEqual(TaskMediaPreviewPager.initialSelection(startIndex: 9, imageCount: 3), 3)
        XCTAssertEqual(TaskMediaPreviewPager.initialSelection(startIndex: 0, imageCount: 0), 0)
    }

    func testSentinelSnapLandsOnTheSameImage() {
        let count = 3
        let leadingSnap = TaskMediaPreviewPager.snapSelection(selection: 0, imageCount: count)
        let trailingSnap = TaskMediaPreviewPager.snapSelection(selection: count + 1, imageCount: count)
        XCTAssertEqual(leadingSnap, count)
        XCTAssertEqual(trailingSnap, 1)
        XCTAssertEqual(
            TaskMediaPreviewPager.imageIndex(selection: 0, imageCount: count),
            TaskMediaPreviewPager.imageIndex(selection: leadingSnap ?? -1, imageCount: count)
        )
        XCTAssertEqual(
            TaskMediaPreviewPager.imageIndex(selection: count + 1, imageCount: count),
            TaskMediaPreviewPager.imageIndex(selection: trailingSnap ?? -1, imageCount: count)
        )
        XCTAssertNil(TaskMediaPreviewPager.snapSelection(selection: 2, imageCount: count))
    }

    func testSwipeWrapsFromLastToFirstAndFirstToLast() {
        let count = 4
        let last = TaskMediaPreviewPager.selection(forImageIndex: count - 1, imageCount: count)
        let afterLast = TaskMediaPreviewPager.selectionByMoving(last, offset: 1, imageCount: count)
        XCTAssertEqual(TaskMediaPreviewPager.imageIndex(selection: afterLast, imageCount: count), 0)

        let first = TaskMediaPreviewPager.selection(forImageIndex: 0, imageCount: count)
        let beforeFirst = TaskMediaPreviewPager.selectionByMoving(first, offset: -1, imageCount: count)
        XCTAssertEqual(TaskMediaPreviewPager.imageIndex(selection: beforeFirst, imageCount: count), count - 1)

        XCTAssertEqual(TaskMediaPreviewPager.wrappedIndex(0, offset: -2, count: 4), 2)
        XCTAssertEqual(TaskMediaPreviewPager.wrappedIndex(3, offset: 2, count: 4), 1)
        XCTAssertEqual(TaskMediaPreviewPager.wrappedIndex(0, offset: -5, count: 4), 3)
        XCTAssertEqual(TaskMediaPreviewPager.wrappedIndex(1, offset: 0, count: 0), 0)
    }

    func testContentLoadOrderPrefersTheOpenedImage() {
        XCTAssertEqual(
            TaskMediaPreviewPager.contentLoadOrder(startID: "b", ids: ["a", "b", "c"]),
            ["b", "a", "c"]
        )
        XCTAssertEqual(
            TaskMediaPreviewPager.contentLoadOrder(startID: "a", ids: ["a", "b", "c"]),
            ["a", "b", "c"]
        )
        XCTAssertEqual(
            TaskMediaPreviewPager.contentLoadOrder(startID: "missing", ids: ["a", "b"]),
            ["a", "b"]
        )
        XCTAssertEqual(TaskMediaPreviewPager.contentLoadOrder(startID: "a", ids: []), [])
    }

    func testTapOutsideTheFittedImageDismisses() {
        let image = CGSize(width: 200, height: 100)
        let container = CGSize(width: 100, height: 100)
        let rect = TaskMediaPreviewPager.aspectFitRect(imageSize: image, in: container)
        XCTAssertEqual(rect.origin.x, 0, accuracy: 0.01)
        XCTAssertEqual(rect.origin.y, 25, accuracy: 0.01)
        XCTAssertEqual(rect.width, 100, accuracy: 0.01)
        XCTAssertEqual(rect.height, 50, accuracy: 0.01)

        XCTAssertFalse(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 50, y: 50),
            imageSize: image,
            container: container
        ))
        XCTAssertTrue(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 50, y: 10),
            imageSize: image,
            container: container
        ))
        XCTAssertFalse(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 50, y: 10),
            movement: 24,
            imageSize: image,
            container: container
        ))
    }

    func testPortraitLetterboxDismissesBesideTheImage() {
        let image = CGSize(width: 100, height: 200)
        let container = CGSize(width: 100, height: 100)
        XCTAssertFalse(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 50, y: 50),
            imageSize: image,
            container: container
        ))
        XCTAssertTrue(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 10, y: 50),
            imageSize: image,
            container: container
        ))
    }

    func testEmptyPageDismissesAndUnlaidOutPageDoesNot() {
        XCTAssertTrue(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 10, y: 10),
            imageSize: .zero,
            container: CGSize(width: 100, height: 100)
        ))
        XCTAssertFalse(TaskMediaPreviewPager.tapDismisses(
            at: CGPoint(x: 10, y: 10),
            imageSize: .zero,
            container: .zero
        ))
        XCTAssertEqual(
            TaskMediaPreviewPager.aspectFitRect(imageSize: CGSize(width: 10, height: 10), in: .zero),
            .zero
        )
    }
}
