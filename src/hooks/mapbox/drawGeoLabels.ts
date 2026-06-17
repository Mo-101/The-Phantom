import type { MapboxDrawContext } from "./types";

const COUNTRIES: { name: string; lat: number; lng: number }[] = [
  { name: "DR CONGO", lat: -2.5, lng: 23.5 },
  { name: "CONGO", lat: -0.7, lng: 15.8 },
  { name: "CENTRAL AFRICAN\nREPUBLIC", lat: 6.6, lng: 20.9 },
  { name: "SOUTH SUDAN", lat: 7.0, lng: 30.0 },
  { name: "SUDAN", lat: 15.5, lng: 30.2 },
  { name: "ETHIOPIA", lat: 9.0, lng: 39.5 },
  { name: "SOMALIA", lat: 5.1, lng: 46.2 },
  { name: "KENYA", lat: -0.5, lng: 37.9 },
  { name: "UGANDA", lat: 1.4, lng: 32.3 },
  { name: "RWANDA", lat: -1.9, lng: 29.9 },
  { name: "BURUNDI", lat: -3.4, lng: 29.9 },
  { name: "TANZANIA", lat: -6.4, lng: 34.9 },
  { name: "CAMEROON", lat: 5.9, lng: 12.7 },
  { name: "NIGERIA", lat: 9.1, lng: 8.7 },
  { name: "NIGER", lat: 17.6, lng: 8.1 },
  { name: "CHAD", lat: 15.5, lng: 18.7 },
  { name: "EGYPT", lat: 26.8, lng: 30.8 },
  { name: "ERITREA", lat: 15.2, lng: 39.8 },
  { name: "DJIBOUTI", lat: 11.6, lng: 43.1 },
  { name: "MOZAMBIQUE", lat: -18.7, lng: 35.5 },
  { name: "MALAWI", lat: -13.3, lng: 34.3 },
  { name: "ZAMBIA", lat: -13.1, lng: 27.8 },
  { name: "ANGOLA", lat: -11.2, lng: 17.9 },
  { name: "GABON", lat: -0.8, lng: 11.6 },
  { name: "LIBYA", lat: 26.3, lng: 17.2 },
  { name: "SOUTH AFRICA", lat: -30.6, lng: 25.0 },
  { name: "MADAGASCAR", lat: -18.8, lng: 46.9 },
  { name: "MALI", lat: 17.6, lng: -2.0 },
  { name: "BURKINA FASO", lat: 12.4, lng: -1.6 },
  { name: "ZIMBABWE", lat: -20.0, lng: 30.0 },
  { name: "BOTSWANA", lat: -22.3, lng: 24.7 },
  { name: "NAMIBIA", lat: -22.9, lng: 18.5 },
];

const ADMIN1_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_1_states_provinces.geojson";

const CITIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson";

const BOUNDS = { minLat: -40, maxLat: 40, minLng: -20, maxLng: 60 };

function inBounds(lat: number, lng: number) {
  return lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng;
}

export async function drawGeoLabels(ctx: MapboxDrawContext): Promise<void> {
  const { map } = ctx;

  // Tier 1: Country labels
  const countryFeatures = COUNTRIES.map((c) => ({
    type: "Feature" as const,
    properties: { name: c.name, tier: "country" },
    geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
  }));

  map.addSource("geo-countries", {
    type: "geojson",
    data: { type: "FeatureCollection", features: countryFeatures },
  });

  map.addLayer({
    id: "geo-country-labels",
    type: "symbol",
    source: "geo-countries",
    minzoom: 2,
    maxzoom: 7,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Bold"],
      "text-size": 14,
      "text-letter-spacing": 0.15,
      "text-transform": "uppercase",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "rgba(255,255,255,0.7)",
      "text-halo-color": "rgba(0,0,0,0.8)",
      "text-halo-width": 2,
    },
  });

  // Tier 2 & 3: Admin-1 + Cities (async)
  try {
    const [admin1Res, citiesRes] = await Promise.all([fetch(ADMIN1_URL), fetch(CITIES_URL)]);

    if (admin1Res.ok) {
      const admin1Gj = await admin1Res.json();
      // Compute centroids for polygon features
      const admin1Features: GeoJSON.Feature[] = [];
      for (const f of admin1Gj.features) {
        const props = f.properties;
        const geom = f.geometry;
        if (!geom || !props?.name) continue;

        let lng: number, lat: number;
        if (geom.type === "Point") {
          [lng, lat] = geom.coordinates;
        } else if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
          const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0]?.[0];
          if (!ring || ring.length === 0) continue;
          let sumLng = 0, sumLat = 0;
          for (const [lo, la] of ring) { sumLng += lo; sumLat += la; }
          lng = sumLng / ring.length;
          lat = sumLat / ring.length;
        } else continue;

        if (!inBounds(lat, lng)) continue;
        admin1Features.push({
          type: "Feature",
          properties: { name: props.name },
          geometry: { type: "Point", coordinates: [lng, lat] },
        });
      }

      map.addSource("geo-admin1", {
        type: "geojson",
        data: { type: "FeatureCollection", features: admin1Features },
      });
      map.addLayer({
        id: "geo-admin1-labels",
        type: "symbol",
        source: "geo-admin1",
        minzoom: 5,
        maxzoom: 8,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "rgba(156,163,175,0.6)",
          "text-halo-color": "rgba(0,0,0,0.6)",
          "text-halo-width": 1.5,
        },
      });
    }

    if (citiesRes.ok) {
      const citiesGj = await citiesRes.json();
      // Filter to bounds
      citiesGj.features = citiesGj.features.filter((f: GeoJSON.Feature) => {
        if (f.geometry.type !== "Point") return false;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        return inBounds(lat, lng);
      });

      map.addSource("geo-cities", { type: "geojson", data: citiesGj });
      map.addLayer({
        id: "geo-city-dots",
        type: "circle",
        source: "geo-cities",
        minzoom: 7,
        paint: {
          "circle-radius": 3,
          "circle-color": "rgba(255,255,255,0.6)",
        },
      });
      map.addLayer({
        id: "geo-city-labels",
        type: "symbol",
        source: "geo-cities",
        minzoom: 7,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-offset": [0.8, 0],
          "text-anchor": "left",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "rgba(209,213,219,0.5)",
          "text-halo-color": "rgba(0,0,0,0.5)",
          "text-halo-width": 1.5,
        },
      });
    }

    console.log("[Mapbox] Drew geo labels");
  } catch (err) {
    console.warn("[Mapbox] Failed to load geo labels:", err);
  }
}
