import type { StyleSpecification } from "maplibre-gl";

const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export const CHINA_OVERVIEW = { lng: 105, lat: 35, zoom: 4 } as const;

export function osmRasterStyle(): StyleSpecification {
  return OSM_RASTER_STYLE;
}

export function mapLibreStyle(): string | StyleSpecification {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || osmRasterStyle();
}
