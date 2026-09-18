from app.services.geo import GeoRateLimiter, parse_photon_feature, parse_photon_response


def test_parse_photon_feature_reads_name_and_wgs84():
    place = parse_photon_feature(
        {
            "type": "Feature",
            "properties": {
                "name": "星巴克",
                "street": "中关村大街",
                "housenumber": "1",
                "city": "北京市",
            },
            "geometry": {"type": "Point", "coordinates": [116.3168, 39.9836]},
        }
    )
    assert place is not None
    assert place.name == "星巴克"
    assert place.lat == 39.9836
    assert place.lng == 116.3168
    assert "北京市" in (place.address or "")


def test_parse_photon_response_skips_bad_features_and_respects_limit():
    payload = {
        "features": [
            {"geometry": {"coordinates": [0, 0]}, "properties": {"name": "A"}},
            {"geometry": {"coordinates": "nope"}, "properties": {"name": "B"}},
            {"geometry": {"coordinates": [1, 2]}, "properties": {"name": "C"}},
        ]
    }
    places = parse_photon_response(payload, limit=1)
    assert [p.name for p in places] == ["A"]


def test_geo_rate_limiter_blocks_within_interval():
    limiter = GeoRateLimiter(min_interval_s=1.0)
    assert limiter.allow("u1", 10.0) is True
    assert limiter.allow("u1", 10.5) is False
    assert limiter.allow("u1", 11.0) is True
    assert limiter.allow("u2", 11.0) is True
