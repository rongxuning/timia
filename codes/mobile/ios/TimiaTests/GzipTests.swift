import XCTest
@testable import Timia

final class GzipTests: XCTestCase {
    func testGzipRoundtripEmpty() throws {
        let gzipped = try Data().gzipCompressed()
        XCTAssertEqual(Array(gzipped.prefix(2)), [0x1F, 0x8B])
        XCTAssertEqual(try gzipped.gzipDecompressed(), Data())
    }

    func testGzipRoundtripJSONMatchesPythonMagic() throws {
        let payload = Data(#"{"timezone":"Asia/Shanghai","samples":[]}"#.utf8)
        let gzipped = try payload.gzipCompressed()
        XCTAssertEqual(Array(gzipped.prefix(2)), [0x1F, 0x8B])
        XCTAssertEqual(gzipped[2], 0x08)
        XCTAssertEqual(try gzipped.gzipDecompressed(), payload)
    }

    func testGzipRoundtripLargerThanBuffer() throws {
        let payload = Data(repeating: 0x61, count: 200_000)
        let gzipped = try payload.gzipCompressed()
        XCTAssertLessThan(gzipped.count, payload.count)
        XCTAssertEqual(try gzipped.gzipDecompressed(), payload)
    }
}
