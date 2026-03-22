import { EvidenceType } from "./intelligence";

export interface SentinelSignal {
  id: string;
  type: EvidenceType;
  description: string;
  weight: number;
  source: string;
  confidence: number;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
  };
}

export class SentinelService {
  private baseUrl: string;
  private token: string;
  private oidcToken: string;

  constructor() {
    this.baseUrl = process.env.AFRO_SENTINEL_API_URL || "https://afro-sentinel.vercel.app/";
    this.token = process.env.AFRO_SENTINEL_TOKEN || "";
    this.oidcToken = process.env.AFRO_SENTINEL_OIDC_TOKEN || "";
  }

  private getAuthorizationHeader(): string {
    // Prefer OIDC token if available for secure federation
    if (this.oidcToken) {
      return `Bearer ${this.oidcToken}`;
    }
    // Fallback to static token
    if (this.token) {
      return `Bearer ${this.token}`;
    }
    return "";
  }

  async fetchSignals(lat: number, lng: number, radiusKm: number = 50): Promise<SentinelSignal[]> {
    try {
      const url = new URL("/api/signals", this.baseUrl);
      url.searchParams.append("lat", lat.toString());
      url.searchParams.append("lng", lng.toString());
      url.searchParams.append("radius", radiusKm.toString());

      const authHeader = this.getAuthorizationHeader();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(url.toString(), {
        headers,
      });

      if (!response.ok) {
        console.warn(`Sentinel API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.warn(`Sentinel API returned non-JSON response (${contentType}): ${text.substring(0, 100)}...`);
        return [];
      }

      const data = await response.json();
      return data.signals || [];
    } catch (error) {
      console.error("Failed to fetch signals from Sentinel:", error);
      return [];
    }
  }
}
