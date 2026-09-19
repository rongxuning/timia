import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test_secret")

from app.services.geo import (
    GeoRateLimiter,
    parse_photon_feature,
    parse_photon_response,
    search_photon_places,
)


PHOTON_SUPPORTED_LANGS = {"default", "de", "en", "fr"}


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


def test_search_photon_places_omits_unsupported_lang(monkeypatch):
    captured: dict = {}

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "features": [
                    {
                        "geometry": {"coordinates": [121.5363679, 31.1705997]},
                        "properties": {"name": "文汇小区", "city": "浦东新区"},
                    }
                ]
            }

    class FakeClient:
        def __init__(self, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, params, headers):
            captured["url"] = url
            captured["params"] = params
            captured["headers"] = headers
            return FakeResp()

    monkeypatch.setattr("app.services.geo.httpx.Client", FakeClient)
    places = search_photon_places("文汇小区", 8)
    lang = captured["params"].get("lang")
    assert lang is None or lang in PHOTON_SUPPORTED_LANGS
    assert captured["params"]["q"] == "文汇小区"
    assert captured["params"]["limit"] == 8
    assert [p.name for p in places] == ["文汇小区"]
