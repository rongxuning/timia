import Foundation
import HealthKit

enum HealthKitAnchorStoreError: Error {
    case encodeFailed
    case decodeFailed
}

/// Persists per-type `HKQueryAnchor` blobs for incremental HealthKit export.
actor HealthKitAnchorStore {
    static let shared = HealthKitAnchorStore()

    private static let keyPrefix = "timia.health.hkAnchor."

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load(key: String) -> HKQueryAnchor? {
        let storageKey = Self.storageKey(key)
        guard let data = defaults.data(forKey: storageKey) else { return nil }
        do {
            return try Self.decode(data)
        } catch {
            defaults.removeObject(forKey: storageKey)
            return nil
        }
    }

    func save(key: String, anchor: HKQueryAnchor) {
        guard let data = try? Self.encode(anchor) else { return }
        defaults.set(data, forKey: Self.storageKey(key))
    }

    func remove(key: String) {
        defaults.removeObject(forKey: Self.storageKey(key))
    }

    func clearAll() {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(Self.keyPrefix) {
            defaults.removeObject(forKey: key)
        }
    }

    /// True when every expected type key loads a valid anchor.
    func hasHealthyAnchors(expectedKeys: [String]) -> Bool {
        guard !expectedKeys.isEmpty else { return false }
        for key in expectedKeys {
            if load(key: key) == nil { return false }
        }
        return true
    }

    func loadAll(keys: [String]) -> [String: HKQueryAnchor] {
        var result: [String: HKQueryAnchor] = [:]
        for key in keys {
            if let anchor = load(key: key) {
                result[key] = anchor
            }
        }
        return result
    }

    func saveAll(_ anchors: [String: HKQueryAnchor]) {
        for (key, anchor) in anchors {
            save(key: key, anchor: anchor)
        }
    }

    // MARK: - NSSecureCoding archive

    /// Safe encode for `HKQueryAnchor` (NSSecureCoding).
    static func encode(_ anchor: HKQueryAnchor) throws -> Data {
        try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
    }

    static func decode(_ data: Data) throws -> HKQueryAnchor {
        guard let anchor = try NSKeyedUnarchiver.unarchivedObject(
            ofClass: HKQueryAnchor.self,
            from: data
        ) else {
            throw HealthKitAnchorStoreError.decodeFailed
        }
        return anchor
    }

    private static func storageKey(_ key: String) -> String {
        keyPrefix + key
    }
}
