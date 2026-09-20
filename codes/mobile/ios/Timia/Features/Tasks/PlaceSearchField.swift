import SwiftUI

struct PlaceSearchField: View {
    @Binding var place: PlaceValue
    let search: (String) async throws -> [GeoPlace]

    @State private var query = ""
    @State private var results: [GeoPlace] = []
    @State private var searching = false
    @State private var searchError: String?
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("地点")
                    .fixedSize()
                    .frame(width: 40, alignment: .leading)
                if place.isPinned {
                    pinnedChip
                } else {
                    TextField("搜索地址或输入名称", text: $query)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($isFocused)
                        .submitLabel(.done)
                        .onSubmit { isFocused = false }
                }
            }

            if searching {
                Text("搜索中…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let searchError {
                Text(searchError)
                    .font(.caption)
                    .foregroundStyle(.red)
            } else if showEmpty {
                Text("未找到该地址")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(results) { hit in
                Button {
                    pick(hit)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hit.name)
                            .foregroundStyle(.primary)
                        if let address = hit.address, !address.isEmpty {
                            Text(address)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(hit.name)
            }
        }
        .onAppear { query = place.name }
        .onChange(of: place) { _, newValue in
            if newValue.isPinned || newValue.name != query {
                query = newValue.name
            }
            if newValue.isPinned {
                results = []
                searchError = nil
                searching = false
                searchTask?.cancel()
            }
        }
        .onChange(of: query) { _, newValue in
            handleQueryChange(newValue)
        }
        .onDisappear { searchTask?.cancel() }
    }

    private var showEmpty: Bool {
        !searching
            && searchError == nil
            && results.isEmpty
            && PlaceValue.shouldSearch(query)
            && !place.isPinned
    }

    private var pinnedChip: some View {
        HStack(spacing: 8) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(TimiaTheme.primary)
            Text(place.name)
                .lineLimit(2)
            Spacer(minLength: 0)
            Button(action: clearPlace) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("清除地点")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(TimiaTheme.primary.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("已定位：\(place.name)")
    }

    private func handleQueryChange(_ newValue: String) {
        let truncated = String(newValue.prefix(PlaceValue.nameMax))
        if truncated != newValue {
            query = truncated
            return
        }
        if place.isPinned, truncated == place.name { return }
        place = .fromFreeText(truncated)
        scheduleSearch(truncated)
    }

    private func scheduleSearch(_ text: String) {
        searchTask?.cancel()
        results = []
        searchError = nil
        guard PlaceValue.shouldSearch(text), !place.isPinned else {
            searching = false
            return
        }
        searching = true
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        searchTask = Task {
            try? await Task.sleep(nanoseconds: PlaceValue.searchDebounceNs)
            guard !Task.isCancelled else { return }
            do {
                let items = try await search(trimmed)
                guard !Task.isCancelled else { return }
                results = items
                searchError = nil
            } catch {
                guard !Task.isCancelled else { return }
                results = []
                searchError = PlaceValue.geoSearchErrorKind(error) == .rateLimited
                    ? "搜索过快，请稍后再试"
                    : "地点搜索暂时不可用"
            }
            if !Task.isCancelled {
                searching = false
            }
        }
    }

    private func pick(_ hit: GeoPlace) {
        searchTask?.cancel()
        searching = false
        results = []
        searchError = nil
        place = .fromSearchHit(hit)
        query = place.name
        isFocused = false
    }

    private func clearPlace() {
        searchTask?.cancel()
        searching = false
        results = []
        searchError = nil
        place = .empty
        query = ""
        isFocused = true
    }
}
