import SwiftUI

struct PinnedTagSelect: View {
    let title: String
    @Binding var selection: String
    let items: [PinnedTagItem]
    var emptyText: String?
    var searchPlaceholder: String = "搜索"
    var onCreate: (() -> Void)?
    var createLabel: String = "新建"

    @State private var anchorId: String?
    @State private var showingMore = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))

            if items.isEmpty {
                if let emptyText {
                    Text(emptyText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if onCreate != nil {
                    WrappingHStack(spacing: 8, lineSpacing: 8) {
                        createButton
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                WrappingHStack(spacing: 8, lineSpacing: 8) {
                    ForEach(tiles) { item in
                        tagButton(item)
                    }
                    if items.count > 5 {
                        moreButton
                    }
                    if onCreate != nil {
                        createButton
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .onAppear(perform: syncAnchor)
        .onChange(of: optionKey) { _, _ in syncAnchor() }
        .onChange(of: selection) { _, _ in syncAnchor() }
        .sheet(isPresented: $showingMore) {
            NavigationStack {
                PinnedTagMoreSheet(
                    title: title,
                    items: sortedItems,
                    selection: $selection,
                    searchPlaceholder: searchPlaceholder
                )
            }
        }
    }

    private var optionKey: String {
        items.map(\.id).sorted().joined(separator: ",")
    }

    private var sortedItems: [PinnedTagItem] {
        sortFavoriteThenCreatedAt(items)
    }

    private var tiles: [PinnedTagItem] {
        visiblePinnedTags(sortedItems, anchorId: anchorId)
    }

    private func syncAnchor() {
        let next = nextPinnedAnchorId(
            sortedItems: sortedItems,
            selectedId: selection.isEmpty ? nil : selection,
            currentAnchorId: anchorId
        )
        if next != anchorId {
            anchorId = next
        }
    }

    private func tagButton(_ item: PinnedTagItem) -> some View {
        let isSelected = selection == item.id
        return Button {
            selection = item.id
        } label: {
            Text(item.label)
                .lineLimit(1)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .padding(.horizontal, 12)
                .frame(height: 32)
                .frame(maxWidth: 144)
                .foregroundStyle(isSelected ? TimiaTheme.primary : .primary)
                .background(
                    isSelected ? TimiaTheme.primary.opacity(0.1) : TimiaTheme.surface,
                    in: Capsule()
                )
                .overlay {
                    Capsule()
                        .stroke(isSelected ? TimiaTheme.primary : TimiaTheme.border, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var moreButton: some View {
        Button {
            showingMore = true
        } label: {
            Text("更多")
                .font(.subheadline)
                .padding(.horizontal, 12)
                .frame(height: 32)
                .foregroundStyle(.primary)
                .background(TimiaTheme.surface, in: Capsule())
                .overlay {
                    Capsule().stroke(TimiaTheme.border, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("更多\(title)")
    }

    private var createButton: some View {
        Button {
            onCreate?()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                Text(createLabel)
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal, 12)
            .frame(height: 32)
            .foregroundStyle(TimiaTheme.primary)
            .background(TimiaTheme.primary.opacity(0.1), in: Capsule())
            .overlay {
                Capsule().stroke(TimiaTheme.primary.opacity(0.4), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct PinnedTagMoreSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dismissSearch) private var dismissSearch
    let title: String
    let items: [PinnedTagItem]
    @Binding var selection: String
    var searchPlaceholder: String
    @State private var searchText = ""

    var body: some View {
        List(filteredItems) { item in
            Button {
                selection = item.id
                dismiss()
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label)
                            .font(.body.weight(.medium))
                            .foregroundStyle(.primary)
                        if let hint = item.hint, !hint.isEmpty {
                            Text(hint)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                    if selection == item.id {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(TimiaTheme.primary)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selection == item.id ? .isSelected : [])
        }
        .navigationTitle("选择\(title)")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: searchPlaceholder)
        .scrollDismissesKeyboard(.interactively)
        .keyboardDoneToolbar { dismissSearch() }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("取消") { dismiss() }
            }
        }
        .overlay {
            if filteredItems.isEmpty {
                ContentUnavailableView.search(text: searchText)
            }
        }
    }

    private var filteredItems: [PinnedTagItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return items }
        return items.filter {
            $0.label.localizedCaseInsensitiveContains(query)
                || ($0.hint?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }
}

private struct WrappingHStack: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(
            proposal: ProposedViewSize(width: bounds.width, height: bounds.height),
            subviews: subviews
        )
        for index in subviews.indices {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + result.origins[index].x, y: bounds.minY + result.origins[index].y),
                proposal: ProposedViewSize(result.sizes[index])
            )
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, origins: [CGPoint], sizes: [CGSize]) {
        let maxWidth = proposal.width ?? .infinity
        var origins: [CGPoint] = []
        var sizes: [CGSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            sizes.append(size)
            rowHeight = max(rowHeight, size.height)
            usedWidth = max(usedWidth, x + size.width)
            x += size.width + spacing
        }

        return (CGSize(width: usedWidth, height: y + rowHeight), origins, sizes)
    }
}
