/**
 * MoStar Phantom XO — Backend Endpoints
 * moscript://codex/v1
 * sass: "All roads lead to Neon now."
 *
 * API endpoint configuration — Supabase removed, Neon direct queries preferred.
 * External API URLs retained for any future server-side proxy.
 */

import { isDevRuntime, readAnyPublicEnv } from "@/lib/publicEnv";

const API_BASE = readAnyPublicEnv("NEXT_PUBLIC_API_BASE_URL", "VITE_API_BASE_URL")?.replace(/\/+$/, "");

function pickUrl(explicit: string | undefined, routeName: string): string {
  if (explicit) return explicit;
  if (API_BASE) return `${API_BASE}/${routeName}`;
  // No more Supabase fallback — use Neon direct queries instead
  console.warn(`[endpoints] No URL for ${routeName}. Using Neon direct queries.`);
  return "";
}

export function getTemporalApiUrl(): string {
  return pickUrl(readAnyPublicEnv("NEXT_PUBLIC_API_TEMPORAL_URL", "VITE_API_TEMPORAL_URL"), "api-temporal");
}

export function getComputeScoresApiUrl(): string {
  return pickUrl(readAnyPublicEnv("NEXT_PUBLIC_API_COMPUTE_SCORES_URL", "VITE_API_COMPUTE_SCORES_URL"), "compute-scores");
}

export function getOllamChatApiUrl(): string {
  const explicit = readAnyPublicEnv("NEXT_PUBLIC_API_OLLAM_CHAT_URL", "VITE_API_OLLAM_CHAT_URL");
  if (explicit) return explicit;

  const ollamaHost = readAnyPublicEnv("NEXT_PUBLIC_OLLAMA_HOST", "VITE_OLLAMA_HOST")?.replace(/\/+$/, "");
  if (ollamaHost) {
    if (isDevRuntime()) return "/ollama/api/chat";
    return `${ollamaHost}/api/chat`;
  }

  return pickUrl(undefined, "ollam-chat");
}

export function getPhantomMcpApiUrl(): string {
  return pickUrl(readAnyPublicEnv("NEXT_PUBLIC_API_PHANTOM_MCP_URL", "VITE_API_PHANTOM_MCP_URL"), "phantom-mcp");
}

/** @deprecated Supabase removed — always returns false */
export function isSupabaseFunctionUrl(_url: string): boolean {
  return false;
}

export function getPublicApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const publicKey = readAnyPublicEnv("NEXT_PUBLIC_API_PUBLIC_KEY", "VITE_API_PUBLIC_KEY");
  if (publicKey) headers["x-api-key"] = publicKey;
  return headers;
}
