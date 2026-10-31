import SwiftUI
import UIKit

struct TaskPreviewImage: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    /// Thumb or local original. Nil until a remote thumb has been cached.
    let placeholder: Data?
    /// Full-size path for an uploaded image. Nil for a photo that is still local.
    let contentPath: String?
}

struct TaskImageLightbox: View {
    let images: [TaskPreviewImage]
    let startID: String
    let files: FilesAPI
    let onClose: () -> Void

    @State private var selection: Int
    @State private var isPagerReady = false
    @State private var snapGeneration = 0
    @State private var decoded: [String: UIImage] = [:]
    @State private var fullIDs: Set<String> = []
    @State private var failedIDs: Set<String> = []

    private let initialSelection: Int

    init(images: [TaskPreviewImage], startID: String, files: FilesAPI, onClose: @escaping () -> Void) {
        self.images = images
        self.startID = startID
        self.files = files
        self.onClose = onClose
        let index = images.firstIndex(where: { $0.id == startID }) ?? 0
        let initial = TaskMediaPreviewPager.initialSelection(startIndex: index, imageCount: images.count)
        initialSelection = initial
        _selection = State(initialValue: initial)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            if !images.isEmpty {
                pager
                    .opacity(isPagerReady ? 1 : 0)
            }
            closeButton
                .padding(.top, 8)
                .padding(.trailing, 16)
        }
        .overlay(alignment: .bottom) {
            pageCounter
        }
        .preferredColorScheme(.dark)
        .presentationBackground(.black)
        .interactiveDismissDisabled()
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        .accessibilityIdentifier("task-image-preview")
        .onAppear(perform: preparePager)
        .onChange(of: placeholderToken) { _, _ in
            cacheMissingPlaceholders()
        }
        .onChange(of: selection) { _, newValue in
            scheduleSnap(from: newValue)
        }
        .onChange(of: currentImageIndex) { _, _ in
            announceCurrentImage()
        }
        .task {
            await loadFullImages()
        }
    }

    private var pager: some View {
        TabView(selection: $selection) {
            ForEach(TaskMediaPreviewPager.pages(imageCount: images.count)) { page in
                previewPage(page)
                    .accessibilityHidden(!isPagerReady || page.isSentinel || page.imageIndex != currentImageIndex)
                    .tag(page.selection)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.black)
        .ignoresSafeArea()
    }

    private var closeButton: some View {
        Button(action: onClose) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(.ultraThinMaterial, in: Circle())
                .environment(\.colorScheme, .dark)
                .padding(6)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("关闭")
        .accessibilityIdentifier("task-image-preview-close")
    }

    @ViewBuilder
    private var pageCounter: some View {
        if images.count > 1 {
            Text("\(currentImageIndex + 1) / \(images.count)")
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.ultraThinMaterial, in: Capsule())
                .environment(\.colorScheme, .dark)
                .padding(.bottom, 12)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private func previewPage(_ page: TaskMediaPreviewPage) -> some View {
        GeometryReader { proxy in
            let container = proxy.size
            let image = image(at: page.imageIndex)
            let uiImage = image.flatMap { decoded[$0.id] }
            ZStack {
                Color.black
                if let image, let uiImage {
                    let fitted = TaskMediaPreviewPager.aspectFitRect(imageSize: uiImage.size, in: container)
                    photo(uiImage, fitted: fitted, image: image, page: page)
                } else if let image, showsSpinner(image) {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                        .accessibilityLabel("正在加载图片")
                } else {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(.white.opacity(0.75))
                        .accessibilityLabel("无法显示图片")
                }
            }
            .frame(width: container.width, height: container.height)
            .contentShape(Rectangle())
            .simultaneousGesture(dismissGesture(imageSize: uiImage?.size ?? .zero, container: container))
        }
        .ignoresSafeArea()
    }

    private func photo(
        _ uiImage: UIImage,
        fitted: CGRect,
        image: TaskPreviewImage,
        page: TaskMediaPreviewPage
    ) -> some View {
        let photo = Image(uiImage: uiImage)
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: fitted.width, height: fitted.height)
            .accessibilityLabel(accessibilityLabel(for: image, index: page.imageIndex))
            .accessibilityAddTraits(.isImage)
        return Group {
            if images.count > 1 {
                photo
                    .accessibilityHint("三指左右轻扫可切换图片")
                    .accessibilityScrollAction { edge in
                        if edge == .leading { shiftImage(by: -1) }
                        if edge == .trailing { shiftImage(by: 1) }
                    }
                    .accessibilityAction(named: "上一张") { shiftImage(by: -1) }
                    .accessibilityAction(named: "下一张") { shiftImage(by: 1) }
            } else {
                photo
            }
        }
    }

    private func dismissGesture(imageSize: CGSize, container: CGSize) -> some Gesture {
        SpatialTapGesture(coordinateSpace: .local).onEnded { value in
            if TaskMediaPreviewPager.tapDismisses(
                at: value.location,
                imageSize: imageSize,
                container: container
            ) {
                onClose()
            }
        }
    }

    private var currentImageIndex: Int {
        TaskMediaPreviewPager.imageIndex(selection: selection, imageCount: images.count)
    }

    private var placeholderToken: String {
        images.map { "\($0.id):\($0.placeholder?.count ?? -1)" }.joined(separator: "|")
    }

    private func image(at index: Int) -> TaskPreviewImage? {
        guard images.indices.contains(index) else { return nil }
        return images[index]
    }

    private func showsSpinner(_ image: TaskPreviewImage) -> Bool {
        decoded[image.id] == nil && image.contentPath != nil && !failedIDs.contains(image.id)
    }

    private func accessibilityLabel(for image: TaskPreviewImage, index: Int) -> String {
        let position = "第 \(index + 1) 张，共 \(images.count) 张"
        let name = image.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return position }
        return "\(name)，\(position)"
    }

    private func shiftImage(by offset: Int) {
        guard images.count > 1 else { return }
        selection = TaskMediaPreviewPager.selectionByMoving(
            selection,
            offset: offset,
            imageCount: images.count
        )
    }

    private func announceCurrentImage() {
        guard isPagerReady, UIAccessibility.isVoiceOverRunning, let image = image(at: currentImageIndex) else { return }
        AccessibilityNotification.Announcement(accessibilityLabel(for: image, index: currentImageIndex)).post()
    }

    private func preparePager() {
        if images.isEmpty {
            onClose()
            return
        }
        cacheMissingPlaceholders()
        guard !isPagerReady else { return }
        Task { @MainActor in
            guard !isPagerReady else { return }
            var transaction = Transaction(animation: nil)
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                selection = initialSelection
            }
            isPagerReady = true
        }
    }

    private func scheduleSnap(from newValue: Int) {
        guard let snap = TaskMediaPreviewPager.snapSelection(selection: newValue, imageCount: images.count) else { return }
        snapGeneration += 1
        let generation = snapGeneration
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(320))
            guard generation == snapGeneration, selection == newValue else { return }
            var transaction = Transaction(animation: nil)
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                selection = snap
            }
        }
    }

    private func cacheMissingPlaceholders() {
        for image in images {
            guard decoded[image.id] == nil, let data = image.placeholder, let uiImage = UIImage(data: data) else { continue }
            decoded[image.id] = uiImage
        }
    }

    private var contentJobs: [(id: String, path: String)] {
        var paths: [String: String] = [:]
        var ids: [String] = []
        for image in images {
            guard let path = image.contentPath else { continue }
            if paths[image.id] != nil { continue }
            paths[image.id] = path
            ids.append(image.id)
        }
        let order = TaskMediaPreviewPager.contentLoadOrder(startID: startID, ids: ids)
        return order.compactMap { id in
            guard let path = paths[id] else { return nil }
            return (id: id, path: path)
        }
    }

    private func loadFullImages() async {
        let pending = contentJobs.filter { !fullIDs.contains($0.id) && !failedIDs.contains($0.id) }
        guard let first = pending.first else { return }
        let api = files
        await load(first, api: api)
        let rest = pending.dropFirst().filter { !fullIDs.contains($0.id) && !failedIDs.contains($0.id) }
        guard !rest.isEmpty else { return }
        let downloaded: [(String, Data?)] = await withTaskGroup(of: (String, Data?).self) { group in
            for job in rest {
                group.addTask {
                    let data = try? await api.download(path: job.path)
                    return (job.id, data)
                }
            }
            var results: [(String, Data?)] = []
            for await item in group {
                results.append(item)
            }
            return results
        }
        guard !Task.isCancelled else { return }
        for (id, data) in downloaded {
            if let data, !data.isEmpty {
                storeFullImage(id: id, data: data)
            } else {
                failedIDs.insert(id)
            }
        }
    }

    private func load(_ job: (id: String, path: String), api: FilesAPI) async {
        guard !fullIDs.contains(job.id), !failedIDs.contains(job.id) else { return }
        if let data = try? await api.download(path: job.path), !data.isEmpty {
            storeFullImage(id: job.id, data: data)
        } else {
            failedIDs.insert(job.id)
        }
    }

    private func storeFullImage(id: String, data: Data) {
        guard let uiImage = UIImage(data: data) else {
            failedIDs.insert(id)
            return
        }
        decoded[id] = uiImage
        fullIDs.insert(id)
    }
}
