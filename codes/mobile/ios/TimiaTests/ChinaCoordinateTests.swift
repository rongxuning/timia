import XCTest
@testable import Timia

final class ChinaCoordinateTests: XCTestCase {
    func testConvertsShanghaiWgs84ToGcj02() {
        let point = ChinaCoordinate.wgs84ToGcj02(lat: 31.1774276, lng: 121.5272106)
        XCTAssertEqual(point.lat, 31.17530398364597, accuracy: 1e-8)
        XCTAssertEqual(point.lng, 121.531541859215, accuracy: 1e-8)
    }

    func testLeavesOverseasAndHongKongUnchanged() {
        let tokyo = ChinaCoordinate.wgs84ToGcj02(lat: 35.6895, lng: 139.6917)
        XCTAssertEqual(tokyo.lat, 35.6895)
        XCTAssertEqual(tokyo.lng, 139.6917)

        let hongKong = ChinaCoordinate.wgs84ToGcj02(lat: 22.3193, lng: 114.1694)
        XCTAssertEqual(hongKong.lat, 22.3193)
        XCTAssertEqual(hongKong.lng, 114.1694)
    }
}
