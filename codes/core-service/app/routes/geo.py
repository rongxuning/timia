from time import time

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.geo import GeoPlacesOut
from app.services.geo import (
    GEO_QUERY_MAX_LEN,
    GEO_QUERY_MIN_LEN,
    geo_rate_limiter,
    search_photon_places,
)

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/places", response_model=GeoPlacesOut)
def search_places(
    q: str = Query("", max_length=GEO_QUERY_MAX_LEN),
    limit: int = Query(8, ge=1, le=10),
    user: User = Depends(get_current_user),
):
    query = q.strip()
    if len(query) < GEO_QUERY_MIN_LEN:
        return GeoPlacesOut(items=[])
    if not geo_rate_limiter.allow(str(user.id), time()):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="geo_rate_limited")
    return GeoPlacesOut(items=search_photon_places(query, limit))
