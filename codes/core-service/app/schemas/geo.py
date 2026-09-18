from pydantic import BaseModel, Field


class GeoPlaceOut(BaseModel):
    name: str
    address: str | None = None
    lat: float
    lng: float


class GeoPlacesOut(BaseModel):
    items: list[GeoPlaceOut] = Field(default_factory=list)
