import Foundation

struct PlaceValue: Equatable, Sendable {
    var name: String
    var lat: Double?
    var lng: Double?

    static let empty = PlaceValue(name: "", lat: nil, lng: nil)
    static let nameMax = 500
    static let searchMinChars = 2
    static let searchDebounceNs: UInt64 = 300_000_000

    var isPinned: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && lat != nil && lng != nil
    }

    static func shouldSearch(_ query: String) -> Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).count >= searchMinChars
    }

    static func fromItem(location: String?, lat: Double?, lng: Double?) -> PlaceValue {
        let name = String((location ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(nameMax))
        if !name.isEmpty, let lat, let lng {
            return PlaceValue(name: name, lat: lat, lng: lng)
        }
        return PlaceValue(name: name, lat: nil, lng: nil)
    }

    static func fromSearchHit(_ hit: GeoPlace) -> PlaceValue {
        PlaceValue(
            name: String(hit.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(nameMax)),
            lat: hit.lat,
            lng: hit.lng
        )
    }

    static func fromFreeText(_ name: String) -> PlaceValue {
        PlaceValue(name: String(name.prefix(nameMax)), lat: nil, lng: nil)
    }

    var itemLocationPayload: ItemLocationPayload {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.nameMax))
        if trimmed.isEmpty {
            return ItemLocationPayload(location: nil, locationLat: nil, locationLng: nil)
        }
        if let lat, let lng {
            return ItemLocationPayload(location: trimmed, locationLat: lat, locationLng: lng)
        }
        return ItemLocationPayload(location: trimmed, locationLat: nil, locationLng: nil)
    }

    enum GeoSearchErrorKind: Equatable {
        case rateLimited
        case unavailable
    }

    static func geoSearchErrorKind(_ error: Error) -> GeoSearchErrorKind {
        if error is CancellationError { return .unavailable }
        guard let api = error as? APIError else { return .unavailable }
        if case let .server(status, message) = api, status == 429 || message == "geo_rate_limited" {
            return .rateLimited
        }
        return .unavailable
    }
}

struct ItemLocationPayload: Equatable, Sendable {
    var location: String?
    var locationLat: Double?
    var locationLng: Double?
}

struct GeoPlace: Decodable, Equatable, Hashable, Sendable, Identifiable {
    let name: String
    let address: String?
    let lat: Double
    let lng: Double

    var id: String { "\(lat),\(lng),\(name)" }
}

struct GeoPlaces: Decodable, Sendable {
    let items: [GeoPlace]
}
