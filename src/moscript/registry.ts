/**
 * ◉⟁⬡  MoStar Industries
 * MoScript Registry — Trinity Loop Persistence
 */

import { MoScript, MoScriptResult, MoStarMoment, RegistryStatus } from "./types";
import crypto from "crypto";

export class MoScriptRegistry {
  private moments: Map<string, MoStarMoment[]> = new Map();

  async register(script: MoScript): Promise<RegistryStatus> {
    const cid = crypto.createHash("sha256").update(JSON.stringify(script)).digest("hex");
    return {
      registered: true,
      cid,
      gridNode: "MoStar-Grid-Node-01",
      timestamp: new Date().toISOString(),
    };
  }

  async sealMoment(result: MoScriptResult, script: MoScript): Promise<MoStarMoment> {
    const momentId = `moment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const moment: MoStarMoment = {
      momentId,
      scriptId: script.id,
      trigger: script.trigger,
      result: result.result,
      wooState: result.woo.meta.wooState,
      sealedAt: new Date().toISOString(),
      gridCypherId: `cypher-${momentId}`,
    };

    const scriptMoments = this.moments.get(script.id) ?? [];
    scriptMoments.push(moment);
    this.moments.set(script.id, scriptMoments);

    return moment;
  }

  async recall(scriptId: string, limit = 5): Promise<MoStarMoment[]> {
    const scriptMoments = this.moments.get(scriptId) ?? [];
    return scriptMoments.slice(-limit).reverse();
  }

  async close(): Promise<void> {
    // Cleanup logic if needed
    console.log("  Registry: connection closed.");
  }
}
