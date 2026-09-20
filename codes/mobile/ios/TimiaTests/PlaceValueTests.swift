import XCTest
@testable import Timia

final class PlaceValueTests: XCTestCase {
    func testPinnedPlaceRequiresNameAndCoordinates() {
        XCTAssertTrue(PlaceValue(name: "星巴克", lat: 39.9836, lng: 116.3168).isPinned)
        XCTAssertFalse(PlaceValue(name: "线上", lat: nil, lng: nil).isPinned)
        XCTAssertFalse(PlaceValue(name: "  ", lat: 1, lng: 2).isPinned)
        XCTAssertFalse(PlaceValue.empty.isPinned)
    }

    func testShouldSearchRequiresTwoTrimmedCharacters() {
        XCTAssertFalse(PlaceValue.shouldSearch(" "))
        XCTAssertFalse(PlaceValue.shouldSearch("上"))
        XCTAssertTrue(PlaceValue.shouldSearch("上海"))
        XCTAssertTrue(PlaceValue.shouldSearch("  文汇小区  "))
    }

    func testFromItemPinsWhenNameAndCoordsArePresent() {
        let place = PlaceValue.fromItem(location: "星巴克", lat: 39.9836, lng: 116.3168)
        XCTAssertTrue(place.isPinned)
        XCTAssertEqual(place.name, "星巴克")
        XCTAssertEqual(place.lat ?? 0, 39.9836, accuracy: 0.0001)
        XCTAssertEqual(place.lng ?? 0, 116.3168, accuracy: 0.0001)
    }

    func testFromItemKeepsFreeTextWithoutCoordinates() {
        let place = PlaceValue.fromItem(location: "线上", lat: nil, lng: nil)
        XCTAssertFalse(place.isPinned)
        XCTAssertEqual(place, PlaceValue(name: "线上", lat: nil, lng: nil))
    }

    func testFromItemDropsOrphanCoordinatesWhenNameIsBlank() {
        let place = PlaceValue.fromItem(location: "  ", lat: 1, lng: 2)
        XCTAssertEqual(place, PlaceValue.empty)
    }

    func testFromSearchHitPinsTrimmedName() {
        let place = PlaceValue.fromSearchHit(
            GeoPlace(name: "  星巴克（中关村大街店） ", address: "北京市海淀区", lat: 39.98, lng: 116.31)
        )
        XCTAssertTrue(place.isPinned)
        XCTAssertEqual(place.name, "星巴克（中关村大街店）")
    }

    func testFreeTextDoesNotAttachCoordinates() {
        let place = PlaceValue.fromFreeText("会议室 A")
        XCTAssertFalse(place.isPinned)
        XCTAssertEqual(place.itemLocationPayload, ItemLocationPayload(
            location: "会议室 A",
            locationLat: nil,
            locationLng: nil
        ))
    }

    func testPayloadSendsTripleForPinnedChipAndClearsTogether() {
        XCTAssertEqual(
            PlaceValue(name: "星巴克", lat: 39.9, lng: 116.3).itemLocationPayload,
            ItemLocationPayload(location: "星巴克", locationLat: 39.9, locationLng: 116.3)
        )
        XCTAssertEqual(
            PlaceValue.empty.itemLocationPayload,
            ItemLocationPayload(location: nil, locationLat: nil, locationLng: nil)
        )
        XCTAssertEqual(
            PlaceValue.fromFreeText("   ").itemLocationPayload,
            ItemLocationPayload(location: nil, locationLat: nil, locationLng: nil)
        )
    }

    func testGeoSearchErrorKindMapsRateLimitAndOtherFailures() {
        XCTAssertEqual(
            PlaceValue.geoSearchErrorKind(APIError.server(status: 429, message: "geo_rate_limited")),
            .rateLimited
        )
        XCTAssertEqual(
            PlaceValue.geoSearchErrorKind(APIError.server(status: 502, message: "geo_provider_error")),
            .unavailable
        )
        XCTAssertEqual(PlaceValue.geoSearchErrorKind(CancellationError()), .unavailable)
    }
}
