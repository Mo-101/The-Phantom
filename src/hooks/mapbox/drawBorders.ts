import type mapboxgl from "mapbox-gl";
import type { MapboxDrawContext } from "./types";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson";

export async function drawBorders(ctx: MapboxDrawContext): Promise<void> {
  const { map } = ctx;
  try {
    const res = await fetch(GEOJSON_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gj = await res.json();

    map.addSource("admin-borders", { type: "geojson", data: gj });

    map.addLayer({
      id: "admin-borders-line",
      type: "line",
      source: "admin-borders",
      paint: {
        "line-color": "#FFFFFF",
        "line-width": 1.5,
        "line-opacity": 0.5,
      },
    });

    console.log("[Mapbox] Drew admin borders");
  } catch (err) {
    console.warn("[Mapbox] Failed to load admin boundaries:", err);
  }
}
