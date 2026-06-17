import type mapboxgl from "mapbox-gl";
import { readAnyPublicEnv } from "@/lib/publicEnv";

export const T = {
  bg: "#070A10",
  green: "#00E87A",
  amber: "#F5A623",
  red: "#FF453A",
  blue: "#009ADE",
  teal: "#3DD9C4",
  text: "#E5E7EB",
};

export const MAPBOX_TOKEN = readAnyPublicEnv(
  "NEXT_PUBLIC_MAPBOX_TOKEN",
  "VITE_MAPBOX_TOKEN",
  "MAPBOX_ACCESS_TOKEN"
);

export interface MapboxDrawContext {
  map: mapboxgl.Map;
}

export interface CorridorMeta {
  id: string;
  name: string;
  risk: string;
  km: number;
  mode: string;
  center: [number, number];
  zoom: number;
}

export const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#EF4444",
  HIGH: "#F97316",
  ELEVATED: "#EAB308",
  MODERATE: "#22C55E",
  LOW: "#3B82F6",
};
