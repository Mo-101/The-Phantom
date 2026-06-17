/**
 * MoStar Phantom XO — Neon Client (re-export)
 * moscript://codex/v1
 * sass: "The database speaks. The map listens."
 *
 * Backward-compatible re-export from the canonical integration module.
 * Existing imports from "@/lib/neon" continue to work unchanged.
 */

export {
  sql,
  queryNeon,
  execNeon,
  isNeonConnected,
  getActiveLaneId,
  clearLaneCache,
} from "@/integrations/neon/client";
