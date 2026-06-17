/**
 * ◉⟁⬡  Phantom POE — Provisional State Machine
 *
 * Exactly as Wolfram wrote it:
 *   - SURGE is disabled
 *   - UNKNOWN_STALE ≠ DORMANT (they are explicitly different states)
 *   - State transitions are sealed — no corridor changes state without
 *     the machine producing a StateTransitionRecord.
 *
 * States:
 *   ACTIVE         — live evidence present, within τ_m window
 *   PROVISIONAL    — evidence present, older than 1×τ_m but < 3×τ_m
 *   UNKNOWN_STALE  — evidence present historically, now > 3×τ_m, quality uncertain
 *   DORMANT        — no evidence ever seen or explicitly cleared
 *   SURGE          — DISABLED (reserved, never entered by the machine)
 *
 * The critical distinction:
 *   UNKNOWN_STALE  means "we had evidence, it aged out — we don't know if it's gone"
 *   DORMANT        means "we have never seen evidence, or evidence was cleared"
 */

import type { GridCell } from './probability.surface';

/* ─── State Enum ─── */

export type CorridorState =
  | 'ACTIVE'
  | 'PROVISIONAL'
  | 'UNKNOWN_STALE'
  | 'DORMANT';
  // SURGE intentionally omitted

/** Why SURGE is disabled */
export const SURGE_DISABLED_REASON =
  'SURGE state is reserved for a future calibrated escalation protocol. ' +
  'No automatic entry into SURGE is permitted. A MoScript seal is required. ' +
  'See: Wolfram Provisional State Contract §4.2';

/* ─── Types ─── */

export interface CellState {
  cellId: string;
  state: CorridorState;
  stateEnteredAt: number; // Date.now()
  posterior: number;
  qBaseline: number;
  evidenceCount: number;
  hasEverHadEvidence: boolean;
}

export interface StateTransitionRecord {
  cellId: string;
  fromState: CorridorState;
  toState: CorridorState;
  reason: string;
  posterior: number;
  transitionAt: string; // ISO-8601
  sealed: true; // every record is sealed
}

/* ─── Thresholds ─── */

const POSTERIOR_ACTIVE_THRESHOLD = 0.35;     // above this → consider ACTIVE candidate
const POSTERIOR_PROVISIONAL_THRESHOLD = 0.15; // above this but below active → PROVISIONAL

/* ─── State Machine ─── */

export class ProvisionalStateMachine {
  private cellStates = new Map<string, CellState>();
  private transitionLog: StateTransitionRecord[] = [];

  /**
   * Evaluate a single GridCell and return the new CellState.
   * Also appends a sealed StateTransitionRecord if state changed.
   */
  evaluate(cell: GridCell, nowMs: number): CellState {
    const existing = this.cellStates.get(cell.cellId);
    const hasEverHadEvidence = (existing?.hasEverHadEvidence ?? false) || cell.evidenceCount > 0;

    const newState = this.computeState(cell, existing, hasEverHadEvidence, nowMs);
    const currentState: CellState = {
      cellId: cell.cellId,
      state: newState,
      stateEnteredAt: existing?.state === newState ? (existing.stateEnteredAt) : nowMs,
      posterior: cell.posterior,
      qBaseline: cell.qBaseline,
      evidenceCount: cell.evidenceCount,
      hasEverHadEvidence,
    };

    // Seal transition if state changed
    if (existing && existing.state !== newState) {
      this.sealTransition(cell.cellId, existing.state, newState, cell.posterior,
        this.transitionReason(existing.state, newState, cell));
    }

    this.cellStates.set(cell.cellId, currentState);
    return currentState;
  }

  /** Evaluate all cells in a surface snapshot */
  evaluateAll(cells: GridCell[], nowMs = Date.now()): CellState[] {
    return cells.map((c) => this.evaluate(c, nowMs));
  }

  /** Get sealed transition log */
  getTransitionLog(limitLast = 100): StateTransitionRecord[] {
    return this.transitionLog.slice(-limitLast);
  }

  /** Get all current cell states */
  getAllStates(): CellState[] {
    return [...this.cellStates.values()];
  }

  /** Summary counts */
  getSummary(): {
    active: number;
    provisional: number;
    unknownStale: number;
    dormant: number;
    surgeActive: false; // always false — SURGE is disabled
  } {
    let active = 0, provisional = 0, unknownStale = 0, dormant = 0;
    for (const s of this.cellStates.values()) {
      switch (s.state) {
        case 'ACTIVE':         active++;         break;
        case 'PROVISIONAL':    provisional++;    break;
        case 'UNKNOWN_STALE':  unknownStale++;   break;
        case 'DORMANT':        dormant++;        break;
      }
    }
    return { active, provisional, unknownStale, dormant, surgeActive: false };
  }

  /* ─── Private ─── */

  private computeState(
    cell: GridCell,
    existing: CellState | undefined,
    hasEverHadEvidence: boolean,
    nowMs: number,
  ): CorridorState {
    // No evidence ever seen → DORMANT
    if (!hasEverHadEvidence && cell.evidenceCount === 0) {
      return 'DORMANT';
    }

    // Calculate evidence age
    const ageMs = cell.lastEvidenceAt != null ? nowMs - cell.lastEvidenceAt : null;

    // Get minimum τ_m among contributing sources (in ms)
    // If no sources contributed, use 45-minute default (GDELT)
    const minTauMs = cell.contributingSourcesMask.size > 0
      ? Math.min(
          ...[...cell.contributingSourcesMask].map((src) => ({
            GDELT:      45 * 60_000,
            GDACS:      18 * 60_000,
            RELIEFWEB:   6 * 3600_000,
            IMERG:       2 * 3600_000,
            FIRMS:      12 * 3600_000,
          }[src]))
        )
      : 45 * 60_000;

    // ACTIVE: high posterior, fresh evidence (< 1×τ_m)
    if (
      cell.posterior >= POSTERIOR_ACTIVE_THRESHOLD &&
      ageMs != null && ageMs < minTauMs
    ) {
      return 'ACTIVE';
    }

    // PROVISIONAL: moderate posterior or evidence aged between 1–3×τ_m
    if (
      cell.posterior >= POSTERIOR_PROVISIONAL_THRESHOLD &&
      ageMs != null && ageMs < 3 * minTauMs
    ) {
      return 'PROVISIONAL';
    }

    // UNKNOWN_STALE: we had evidence (hasEverHadEvidence=true) but it has
    // now aged beyond 3×τ_m — we don't know if the situation resolved.
    // This is NOT the same as DORMANT.
    if (hasEverHadEvidence && (ageMs == null || ageMs >= 3 * minTauMs)) {
      return 'UNKNOWN_STALE';
    }

    // DORMANT: evidence was seen but posterior has fully decayed to baseline
    // and the cell has never had strong activation.
    return 'DORMANT';
  }

  private transitionReason(
    from: CorridorState,
    to: CorridorState,
    cell: GridCell,
  ): string {
    const p = cell.posterior.toFixed(3);
    const sources = [...cell.contributingSourcesMask].join('+') || 'none';
    return `${from}→${to}: posterior=${p}, sources=[${sources}], evidenceCount=${cell.evidenceCount}`;
  }

  private sealTransition(
    cellId: string,
    from: CorridorState,
    to: CorridorState,
    posterior: number,
    reason: string,
  ): void {
    // Guard: SURGE is never a valid transition target
    if (to === ('SURGE' as CorridorState)) {
      throw new Error(
        `[ProvisionalStateMachine] Illegal transition to SURGE blocked. ${SURGE_DISABLED_REASON}`
      );
    }

    const record: StateTransitionRecord = {
      cellId,
      fromState: from,
      toState: to,
      reason,
      posterior,
      transitionAt: new Date().toISOString(),
      sealed: true,
    };

    this.transitionLog.push(record);
    console.log(`[StateMachine] ⟁ ${cellId}: ${from} → ${to} | p=${posterior.toFixed(3)}`);
  }
}

// Singleton
let _machine: ProvisionalStateMachine | null = null;

export function getStateMachine(): ProvisionalStateMachine {
  if (!_machine) {
    _machine = new ProvisionalStateMachine();
  }
  return _machine;
}
