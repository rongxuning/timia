"""Photon geocoding proxy helpers (no vendor keys)."""

from __future__ import annotations

import threading
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.schemas.geo import GeoPlaceOut

GEO_QUERY_MIN_LEN = 2
GEO_QUERY_MAX_LEN = 200
GEO_RATE_INTERVAL_S = 1.0


class GeoRateLimiter:
    def __init__(self, min_interval_s: float = GEO_RATE_INTERVAL_S):
        self.min_interval_s = min_interval_s
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()

    def allow(self, user_id: str, now: float) -> bool:
        with self._lock:
            previous = self._last.get(user_id)
            if previous is not None and now - previous < self.min_interval_s:
                return False
            self._last[user_id] = now
            return True


geo_rate_limiter = GeoRateLimiter()


def _join_parts(*parts: Any) -> str | None:
    values = [str(part).strip() for part in parts if part is not None and str(part).strip()]
    if not values:
        return None
    return ", ".join(values)


def parse_photon_feature(feature: dict[str, Any]) -> GeoPlaceOut | None:
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates")
    if not isinstance(coords, (list, tuple)) or len(coords) < 2:
        return None
    try:
        lng = float(coords[0])
        lat = float(coords[1])
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return None
    props = feature.get("properties") or {}
    name = str(props.get("name") or "").strip()
    if not name:
        name = _join_parts(props.get("housenumber"), props.get("street"), props.get("city")) or "地点"
    address = _join_parts(
        props.get("housenumber"),
        props.get("street"),
        props.get("district"),
        props.get("city"),
        props.get("state"),
        props.get("country"),
    )
    return GeoPlaceOut(name=name[:500], address=address, lat=lat, lng=lng)


def parse_photon_response(payload: Any, *, limit: int) -> list[GeoPlaceOut]:
    if not isinstance(payload, dict):
        return []
    features = payload.get("features") or []
    places: list[GeoPlaceOut] = []
    if not isinstance(features, list):
        return []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        place = parse_photon_feature(feature)
        if place is None:
            continue
        places.append(place)
        if len(places) >= limit:
            break
    return places


def search_photon_places(query: str, limit: int) -> list[GeoPlaceOut]:
    from app.core.config import settings

    url = f"{settings.photon_base_url.rstrip('/')}/api"
    try:
        with httpx.Client(timeout=settings.photon_timeout_seconds) as client:
            response = client.get(
                url,
                # Photon public instance only accepts lang=default|de|en|fr.
                # zh returns 400 and surfaces as geo_provider_error.
                params={"q": query, "limit": limit},
                headers={"User-Agent": settings.photon_user_agent},
            )
            response.raise_for_status()
            return parse_photon_response(response.json(), limit=limit)
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="geo_provider_error",
        ) from error
