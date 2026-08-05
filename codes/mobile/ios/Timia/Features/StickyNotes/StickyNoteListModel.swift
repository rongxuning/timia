import Foundation
import CoreLocation

/// Backing store for the sticky-note list pane. Holds the most-recently-loaded
/// page and supports appending / prepending individual notes optimistically.
@MainActor
final class StickyNoteListModel: ObservableObject {
    @Published private(set) var notes: [StickyNote] = []
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var errorMessage: String? = nil
    @Published private(set) var hasMore: Bool = false
    private var nextCursor: String? = nil

    func refresh(api: StickyNotesAPI) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let resp = try await api.list(limit: 50, cursor: nil)
            notes = resp.items
            nextCursor = resp.nextCursor
            hasMore = resp.nextCursor != nil
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func loadMore(api: StickyNotesAPI) async {
        guard hasMore, !isLoading, let cursor = nextCursor else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let resp = try await api.list(limit: 50, cursor: cursor)
            // Dedup by id (defensive)
            let existing = Set(notes.map(\.id))
            let fresh = resp.items.filter { !existing.contains($0.id) }
            notes.append(contentsOf: fresh)
            nextCursor = resp.nextCursor
            hasMore = resp.nextCursor != nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func remove(_ id: String) {
        notes.removeAll { $0.id == id }
    }

    func replace(_ note: StickyNote) {
        if let idx = notes.firstIndex(where: { $0.id == note.id }) {
            notes[idx] = note
        }
    }

    func prepend(_ note: StickyNote) {
        notes.insert(note, at: 0)
    }
}

/// Tiny wrapper around ``CLLocationManager`` for the location chip.
///
/// Requests ``whenInUse`` authorization on first use. Caches the most recent
/// fix for the rest of the session so the chip does not ask twice.
@MainActor
final class StickyNoteLocationManager: NSObject, CLLocationManagerDelegate {
    enum LocError: LocalizedError {
        case permissionDenied
        case timedOut
        case noFix

        var errorDescription: String? {
            switch self {
            case .permissionDenied: return "未授权定位权限（设置 → Timia）"
            case .timedOut: return "定位超时，请稍后再试"
            case .noFix: return "暂未获取到位置"
            }
        }
    }

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<StickyNoteLocationSnapshot, Error>?
    private var timeoutTask: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestCurrent() async throws -> StickyNoteLocationSnapshot {
        // Ask for permission lazily.
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        guard manager.authorizationStatus == .authorizedWhenInUse
            || manager.authorizationStatus == .authorizedAlways else {
            throw LocError.permissionDenied
        }
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<StickyNoteLocationSnapshot, Error>) in
            self.continuation = cont
            manager.requestLocation()
            timeoutTask?.cancel()
            timeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                guard let self else { return }
                if let c = self.continuation {
                    self.continuation = nil
                    c.resume(throwing: LocError.timedOut)
                }
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            self.timeoutTask?.cancel()
            self.timeoutTask = nil
            let snap = StickyNoteLocationSnapshot(
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude,
                accuracyM: loc.horizontalAccuracy,
                name: nil,
                source: "gps"
            )
            if let c = self.continuation {
                self.continuation = nil
                c.resume(returning: snap)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.timeoutTask?.cancel()
            self.timeoutTask = nil
            if let c = self.continuation {
                self.continuation = nil
                c.resume(throwing: LocError.noFix)
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // If user just denied while we were waiting, surface that immediately.
        let status = manager.authorizationStatus
        if status == .denied || status == .restricted {
            Task { @MainActor in
                self.timeoutTask?.cancel()
                if let c = self.continuation {
                    self.continuation = nil
                    c.resume(throwing: LocError.permissionDenied)
                }
            }
        }
    }
}
