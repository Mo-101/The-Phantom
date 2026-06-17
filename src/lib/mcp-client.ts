/**
 * MoStar Phantom XO — MCP Client
 * moscript://codex/v1
 * sass: "Tools speak through Neon now."
 *
 * MCP tool interface — replaces Supabase edge function calls
 * with direct Neon-backed MCP handler.
 */

import { MCP_TOOLS, handleMcpTool } from "@/integrations/neon/api/mcp";
import type { MapParams } from "@/types/phantom";

interface McpToolResult {
  text?: string;
  mapParams?: MapParams;
  isError?: boolean;
}

export async function listMcpTools(): Promise<Array<{ name: string; description: string }>> {
  return MCP_TOOLS;
}

export async function callMcpTool(
  tool: string,
  args: Record<string, unknown> = {}
): Promise<McpToolResult> {
  try {
    return await handleMcpTool(tool, args);
  } catch (err) {
    console.error("[MCP] Tool error:", err);
    return { text: `Error: ${(err as Error).message}`, isError: true };
  }
}
