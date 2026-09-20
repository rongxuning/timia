import CoreLocation
import Foundation

/// Resolves the schedule-map header to `国家 · 城市` via When-In-Use location.
@MainActor
final class ScheduleMapPlaceTitle: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var title = "定位中…"

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var isRefreshing = false
    private static var sessionCache: String?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        if let cached = Self.sessionCache {
            title = cached
        }
    }

    func refresh(force: Bool = false) {
        if let cached = Self.sessionCache, !force {
            title = cached
        } else if Self.sessionCache == nil {
            title = "定位中…"
        }
        guard !isRefreshing else { return }
        isRefreshing = true

        switch manager.authorizationStatus {
        case .notDetermined:
            title = "定位中…"
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            title = "位置不可用"
            isRefreshing = false
        @unknown default:
            title = "位置不可用"
            isRefreshing = false
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                self.manager.requestLocation()
            case .denied, .restricted:
                self.title = "位置不可用"
                self.isRefreshing = false
            case .notDetermined:
                break
            @unknown default:
                self.title = "位置不可用"
                self.isRefreshing = false
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let latitude = location.coordinate.latitude
        let longitude = location.coordinate.longitude
        Task { @MainActor in
            await self.resolvePlace(for: CLLocation(latitude: latitude, longitude: longitude))
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.title = "位置不可用"
            self.isRefreshing = false
        }
    }

    private func resolvePlace(for location: CLLocation) async {
        do {
            let placemarks = try await reverseGeocode(location)
            let label = Self.formatPlaceTitle(from: placemarks.first)
            if let label {
                title = label
                Self.sessionCache = label
            } else {
                title = "位置不可用"
            }
        } catch {
            title = "位置不可用"
        }
        isRefreshing = false
    }

    private func reverseGeocode(_ location: CLLocation) async throws -> [CLPlacemark] {
        try await withCheckedThrowingContinuation { continuation in
            geocoder.reverseGeocodeLocation(location) { placemarks, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: placemarks ?? [])
                }
            }
        }
    }

    static func formatPlaceTitle(from placemark: CLPlacemark?) -> String? {
        formatPlaceTitle(country: placemark?.country, city: placemark?.locality ?? placemark?.administrativeArea)
    }

    static func formatPlaceTitle(country: String?, city: String?) -> String? {
        let country = country?.trimmingCharacters(in: .whitespacesAndNewlines)
        let city = city?.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasCountry = !(country ?? "").isEmpty
        let hasCity = !(city ?? "").isEmpty
        if hasCountry, hasCity, let country, let city {
            return "\(country) · \(city)"
        }
        if hasCountry, let country { return country }
        if hasCity, let city { return city }
        return nil
    }
}
