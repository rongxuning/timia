import CoreGraphics
import Foundation

/// One slot in the task-image lightbox pager.
///
/// Two or more images get a clone of the last image in front and a clone of the
/// first image at the end. A swipe past either end lands on a clone, then the
/// selection snaps to the matching real page so the gallery wraps.
struct TaskMediaPreviewPage: Equatable, Identifiable, Sendable {
    let selection: Int
    let imageIndex: Int
    let isSentinel: Bool

    var id: Int { selection }
}

enum TaskMediaPreviewPager {
    static func pages(imageCount: Int) -> [TaskMediaPreviewPage] {
        guard imageCount > 0 else { return [] }
        if imageCount == 1 {
            return [TaskMediaPreviewPage(selection: 0, imageIndex: 0, isSentinel: false)]
        }
        var pages = [
            TaskMediaPreviewPage(selection: 0, imageIndex: imageCount - 1, isSentinel: true)
        ]
        for index in 0..<imageCount {
            pages.append(
                TaskMediaPreviewPage(selection: index + 1, imageIndex: index, isSentinel: false)
            )
        }
        pages.append(
            TaskMediaPreviewPage(selection: imageCount + 1, imageIndex: 0, isSentinel: true)
        )
        return pages
    }

    static func initialSelection(startIndex: Int, imageCount: Int) -> Int {
        guard imageCount > 0 else { return 0 }
        let clamped = min(max(startIndex, 0), imageCount - 1)
        return selection(forImageIndex: clamped, imageCount: imageCount)
    }

    /// Tab selection for a real image. Sentinels use the neighboring indexes.
    static func selection(forImageIndex index: Int, imageCount: Int) -> Int {
        guard imageCount > 1 else { return 0 }
        let clamped = min(max(index, 0), imageCount - 1)
        return clamped + 1
    }

    /// Selection to jump to, without animation, after a swipe lands on a clone.
    static func snapSelection(selection: Int, imageCount: Int) -> Int? {
        guard imageCount > 1 else { return nil }
        if selection == 0 { return imageCount }
        if selection == imageCount + 1 { return 1 }
        return nil
    }

    static func imageIndex(selection: Int, imageCount: Int) -> Int {
        guard imageCount > 0 else { return 0 }
        if imageCount == 1 { return 0 }
        if selection <= 0 { return imageCount - 1 }
        if selection >= imageCount + 1 { return 0 }
        return selection - 1
    }

    static func wrappedIndex(_ index: Int, offset: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        let remainder = (index + offset) % count
        return remainder >= 0 ? remainder : remainder + count
    }

    /// Move by `offset` images and land on a real page, wrapping past either end.
    static func selectionByMoving(_ selection: Int, offset: Int, imageCount: Int) -> Int {
        guard imageCount > 0 else { return 0 }
        let current = imageIndex(selection: selection, imageCount: imageCount)
        let next = wrappedIndex(current, offset: offset, count: imageCount)
        return self.selection(forImageIndex: next, imageCount: imageCount)
    }

    /// Download the opened image before the others.
    static func contentLoadOrder(startID: String, ids: [String]) -> [String] {
        guard let index = ids.firstIndex(of: startID) else { return ids }
        var ordered = ids
        ordered.remove(at: index)
        ordered.insert(startID, at: 0)
        return ordered
    }

    /// Letterboxed image rect. `imageSize` and `container` share one coordinate space.
    static func aspectFitRect(imageSize: CGSize, in container: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0, container.width > 0, container.height > 0 else {
            return .zero
        }
        let scale = min(container.width / imageSize.width, container.height / imageSize.height)
        let width = imageSize.width * scale
        let height = imageSize.height * scale
        return CGRect(
            x: (container.width - width) / 2,
            y: (container.height - height) / 2,
            width: width,
            height: height
        )
    }

    /// A still tap outside the fitted image dismisses. Drags are swipes, not taps.
    static func tapDismisses(
        at point: CGPoint,
        movement: CGFloat = 0,
        imageSize: CGSize,
        container: CGSize,
        tapSlop: CGFloat = 12
    ) -> Bool {
        guard movement >= 0, movement <= tapSlop else { return false }
        guard container.width > 0, container.height > 0 else { return false }
        let rect = aspectFitRect(imageSize: imageSize, in: container)
        // No decoded image yet: the dimmed page itself is the empty area.
        guard rect.width > 0, rect.height > 0 else { return true }
        return !rect.contains(point)
    }
}
