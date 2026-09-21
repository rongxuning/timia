import CoreLocation
import Foundation

/// Photon / HealthKit store WGS-84. Apple Maps and 高德 tiles in mainland China are GCJ-02,
/// the same mismatch that offset workout tracks on a China basemap.
enum ChinaCoordinate {
    private static let pi = Double.pi
    private static let a = 6_378_245.0
    private static let ee = 0.00669342162296594323

    static func isMainlandChina(lat: Double, lng: Double) -> Bool {
        if lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271 { return false }
        if lng > 119.3 && lng < 122.1 && lat > 21.8 && lat < 25.4 { return false }
        if lng > 113.75 && lng < 114.5 && lat > 22.13 && lat < 22.58 { return false }
        if lng > 113.52 && lng < 113.65 && lat > 22.09 && lat < 22.22 { return false }
        return true
    }

    static func wgs84ToGcj02(lat: Double, lng: Double) -> (lat: Double, lng: Double) {
        guard isMainlandChina(lat: lat, lng: lng) else { return (lat, lng) }
        let dLat = transformLat(lng - 105, lat - 35)
        let dLng = transformLng(lng - 105, lat - 35)
        let radLat = (lat / 180) * pi
        let magic = 1 - ee * sin(radLat) * sin(radLat)
        let sqrtMagic = sqrt(magic)
        let latShift = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * pi)
        let lngShift = (dLng * 180) / ((a / sqrtMagic) * cos(radLat) * pi)
        return (lat + latShift, lng + lngShift)
    }

    static func mapKitCoordinate(lat: Double, lng: Double) -> CLLocationCoordinate2D {
        let gcj = wgs84ToGcj02(lat: lat, lng: lng)
        return CLLocationCoordinate2D(latitude: gcj.lat, longitude: gcj.lng)
    }

    private static func transformLat(_ x: Double, _ y: Double) -> Double {
        var ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x))
        ret += (20 * sin(6 * x * pi) + 20 * sin(2 * x * pi)) * 2 / 3
        ret += (20 * sin(y * pi) + 40 * sin((y / 3) * pi)) * 2 / 3
        ret += (160 * sin((y / 12) * pi) + 320 * sin((y * pi) / 30)) * 2 / 3
        return ret
    }

    private static func transformLng(_ x: Double, _ y: Double) -> Double {
        var ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x))
        ret += (20 * sin(6 * x * pi) + 20 * sin(2 * x * pi)) * 2 / 3
        ret += (20 * sin(x * pi) + 40 * sin((x / 3) * pi)) * 2 / 3
        ret += (150 * sin((x / 12) * pi) + 300 * sin((x / 30) * pi)) * 2 / 3
        return ret
    }
}
