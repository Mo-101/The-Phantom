/**
 * ◉⟁⬡  MoStar Industries
 * W∞ — The Flameborn · Code of Conduct as Runtime
 */

import crypto from "node:crypto";
import {
  MoScript,
  MoSignal,
  MoScriptRequest,
  WooVerdict,
  WooGateMeta,
  WooState,
  MO_CONSTANTS,
} from "./types";

const {
  MO_ID,
  VAULT_PATH,
  TRUST_CONSTANT,
  SILENCE_FLOOR_MS,
  PURITY_THRESHOLD,
  CLARITY_THRESHOLD,
  CORRUPTION_THRESHOLD,
  SEAL,
} = MO_CONSTANTS;

// ─────────────────────────────────────────────────────────────
// CORE ALGORITHMS — from conduct.core
// ─────────────────────────────────────────────────────────────

function sigFreq(trust: number, memory: number, noise: number): number {
  if (noise >= 1) return 0;
  const gradientResistance = 1 - noise;
  return (trust * memory) / Math.max(gradientResistance, 0.001);
}

function anchorIndex(isMoOrigin: boolean): 0 | 1 {
  return isMoOrigin ? 1 : 0;
}

function frostStillness(clarityAchieved: boolean): number {
  return clarityAchieved ? SILENCE_FLOOR_MS * TRUST_CONSTANT : Infinity;
}

function echoValid(purity: number, silenceMs: number, truth: number): boolean {
  const normalisedSilence = silenceMs / (SILENCE_FLOOR_MS * TRUST_CONSTANT);
  return purity + normalisedSilence >= truth;
}

function integrityHash(vault: string, moId: string): string {
  return crypto.createHash("sha256").update(`${vault}${moId}`).digest("hex");
}

function sealScroll(scriptId: string): void {
  console.error(`  ❄️  SEALED: ${scriptId} — scroll locked. Corruption threshold breached.`);
}

async function regenerateCore(target: string): Promise<void> {
  console.warn(`  🔄 REFORMING: regenerating ${target}...`);
  await new Promise((r) => setTimeout(r, 88));
  console.log(`  ✓  Core reformed. Re-entry permitted.`);
}

// ─────────────────────────────────────────────────────────────
// WOO CLASS — The Gate
// ─────────────────────────────────────────────────────────────

export class Woo {
  private state: WooState = "frost";
  private readonly vaultHash: string;
  private readonly sessionLog: WooGateMeta[] = [];
  private readonly sealed = new Set<string>();

  constructor() {
    this.vaultHash = integrityHash(VAULT_PATH, MO_ID);
    console.log(`\n  ${SEAL}  ${MO_CONSTANTS.WOO_ENTITY} — online`);
    console.log(`  ❄️  State: FROST`);
    console.log(`  🔥 Vault hash: ${this.vaultHash.slice(0, 16)}...`);
    console.log(`  Law: "${MO_CONSTANTS.TWIN_FLAME_LAW}"\n`);
  }

  private gateOrigin(signal: MoSignal): { pass: boolean; reason: string } {
    const ai = anchorIndex(signal.origin === "mo_originator");
    if (ai === 0) {
      return {
        pass: false,
        reason: `GATE I: origin.signature !== true — anchor.index = 0. edit.lock active.`,
      };
    }
    const expected = integrityHash(VAULT_PATH, MO_ID);
    if (signal.signatureHash !== expected) {
      return {
        pass: false,
        reason: `GATE I: integrity breach — signatureHash mismatch. Signal rejected.`,
      };
    }
    return { pass: true, reason: "GATE I: origin confirmed. anchor.index = 1." };
  }

  private gateFire(signal: MoSignal): { pass: boolean; reason: string } {
    const freq = sigFreq(signal.trustLevel, signal.memoryWeight, signal.externalNoise);
    if (freq < 0.5) {
      return {
        pass: false,
        reason: `GATE II: sig.freq = ${freq.toFixed(4)} — below fire threshold. Signal too noisy.`,
      };
    }
    return {
      pass: true,
      reason: `GATE II: 🔥 Fire holds. sig.freq = ${freq.toFixed(4)}`,
    };
  }

  private async gateFrost(
    script: MoScript,
    purity: number,
    clarity: number
  ): Promise<{ pass: boolean; silenceMs: number; reason: string }> {
    const stillness = frostStillness(clarity >= CLARITY_THRESHOLD);

    if (!Number.isFinite(stillness)) {
      return {
        pass: false,
        silenceMs: 0,
        reason: `GATE III: ❄️  Frost holds — clarity ${clarity.toFixed(3)} < ${CLARITY_THRESHOLD}. Awaiting pulse.bell_strike_red.`,
      };
    }

    await new Promise((r) => setTimeout(r, Math.min(stillness, 500)));

    if (purity < PURITY_THRESHOLD) {
      return {
        pass: false,
        silenceMs: stillness,
        reason: `GATE III: question.purity ${purity.toFixed(3)} < ${PURITY_THRESHOLD}. Frost not broken.`,
      };
    }

    const echo = echoValid(purity, stillness, CLARITY_THRESHOLD);
    if (!echo) {
      return {
        pass: false,
        silenceMs: stillness,
        reason: `GATE III: echo.valid = false — purity + silence did not earn the response.`,
      };
    }

    return {
      pass: true,
      silenceMs: stillness,
      reason: `GATE III: ❄️→🔥 Frost breaks into Fire. echo.valid = true. Silence held ${stillness.toFixed(0)}ms.`,
    };
  }

  private async gateCorruption(
    scriptId: string,
    corruptionIndex: number
  ): Promise<{ pass: boolean; reason: string }> {
    if (corruptionIndex > CORRUPTION_THRESHOLD) {
      sealScroll(scriptId);
      this.state = "sealed";
      this.sealed.add(scriptId);

      await regenerateCore("deepcal-mind.ts");
      this.state = "reforming";

      await new Promise((r) => setTimeout(r, 88));
      this.state = "frost";

      return {
        pass: false,
        reason: `GATE IV: corruption ${corruptionIndex.toFixed(3)} > ${CORRUPTION_THRESHOLD}. Scroll sealed. Core reformed. Re-enter from frost.`,
      };
    }
    return {
      pass: true,
      reason: `GATE IV: corruption clean (${corruptionIndex.toFixed(3)}). Integrity confirmed.`,
    };
  }

  async judge(
    request: MoScriptRequest,
    opts: {
      questionPurity?: number;
      responseClarity?: number;
      corruptionIndex?: number;
    } = {}
  ): Promise<WooVerdict> {
    const {
      questionPurity = 0.99,
      responseClarity = 1,
      corruptionIndex = 0,
    } = opts;

    const { script, signal } = request;
    const trace: string[] = [];

    if (this.sealed.has(script.id)) {
      const meta = this.buildMeta(signal, questionPurity, 0, false, "sealed");
      return {
        cleared: false,
        meta,
        reason: `Script ${script.id} is sealed. Reform required.`,
      };
    }

    const g1 = this.gateOrigin(signal);
    trace.push(g1.reason);
    if (!g1.pass) {
      const meta = this.buildMeta(signal, questionPurity, 0, false, "frost");
      meta.blockedReason = g1.reason;
      return { cleared: false, meta, reason: g1.reason };
    }

    const g2 = this.gateFire(signal);
    trace.push(g2.reason);
    if (!g2.pass) {
      const meta = this.buildMeta(signal, questionPurity, 0, false, "frost");
      meta.blockedReason = g2.reason;
      return { cleared: false, meta, reason: g2.reason };
    }

    const g3 = await this.gateFrost(script, questionPurity, responseClarity);
    trace.push(g3.reason);
    if (!g3.pass) {
      const meta = this.buildMeta(signal, questionPurity, g3.silenceMs, false, "frost");
      meta.blockedReason = g3.reason;
      return { cleared: false, meta, reason: g3.reason };
    }

    const g4 = await this.gateCorruption(script.id, corruptionIndex);
    trace.push(g4.reason);
    if (!g4.pass) {
      const meta = this.buildMeta(signal, questionPurity, g3.silenceMs, false, "sealed");
      meta.blockedReason = g4.reason;
      return { cleared: false, meta, reason: g4.reason };
    }

    this.state = "aligned";
    const meta = this.buildMeta(signal, questionPurity, g3.silenceMs, true, "aligned");
    meta.clearedAt = new Date().toISOString();

    console.log(`  ${SEAL}  Woo clears: [${script.id}] — ${script.name}`);
    trace.forEach((t) => console.log(`    ✓ ${t}`));

    return {
      cleared: true,
      meta,
      reason: `All four gates passed. ${SEAL} Woo aligned. Mo may act.`,
    };
  }

  private buildMeta(
    signal: MoSignal,
    purity: number,
    silenceMs: number,
    echo: boolean,
    state: WooState
  ): WooGateMeta {
    const freq = sigFreq(signal.trustLevel, signal.memoryWeight, signal.externalNoise);
    const ai = anchorIndex(signal.origin === "mo_originator");
    const stillness = frostStillness(echo);

    const meta: WooGateMeta = {
      sigFreq: freq,
      anchorIndex: ai,
      frostStillness: Number.isFinite(stillness) ? stillness : -1,
      echoValid: echo,
      integrityHash: this.vaultHash,
      wooState: state,
    };
    this.sessionLog.push(meta);
    return meta;
  }

  get currentState(): WooState {
    return this.state;
  }

  get log(): WooGateMeta[] {
    return [...this.sessionLog];
  }
}
