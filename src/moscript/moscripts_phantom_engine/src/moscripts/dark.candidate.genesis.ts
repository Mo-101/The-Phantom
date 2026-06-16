/**
 * ◉⟁⬡  MoStar Industries
 * Dark Corridor Candidate Genesis Engine
 */

import { Pool } from 'pg';
import crypto from 'node:crypto';
import { SourceFamily, calculateFreshnessWeight, calculateContribution } from './evidenceFamilies';

export interface DarkCorridorCandidate {
  candidateId: string;
  reportedName: string;
  canonicalName: string | null;
  candidateStatus: 'REPORTED' | 'EVIDENCE_GATHERING' | 'INFERENCE' | 'GENESIS_REVIEW' | 'PROMOTED' | 'REJECTED';
  posteriorScore: number;
  uncertainty: number;
  geometryStatus: 'PENDING' | 'RUNTIME_INFERRED' | 'FIELD_VALIDATED';
  fieldValidation: 'PENDING' | 'GROUND_TEAM_DISPATCHED' | 'CONFIRMED' | 'REFUTED';
  synthetic: boolean;
  reportedBy: string;
  reportedAt: Date;
  createdAt: Date;
  lastEvidenceAt: Date | null;
  explanationJson: Record<string, any>;
}

export interface DarkEvidence {
  evidenceId: string;
  candidateId: string;
  sourceId: string;
  sourceFamily: SourceFamily;
  observedAt: Date;
  ingestedAt: Date;
  rawScore: number;
  freshnessWeight: number;
  contribution: number;
  synthetic: boolean;
  provenanceJson: Record<string, any>;
}

export interface DarkCorridorPath {
  pathId: string;
  candidateId: string;
  rank: number;
  posteriorMass: number;
  geometryGeojson: Record<string, any>;
  terrainCost: number;
  description: string;
}

export class DarkCandidateGenesisEngine {
  constructor(private readonly pool: Pool) {}

  async createCandidate(reportedName: string, reportedBy: string, reportedAt: Date = new Date()): Promise<DarkCorridorCandidate> {
    const candidateId = `DARK-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const result = await this.pool.query(
      `
      INSERT INTO dark_corridor_candidates (
        candidate_id, reported_name, candidate_status, reported_by, reported_at
      ) VALUES ($1, $2, 'REPORTED', $3, $4)
      RETURNING *
      `,
      [candidateId, reportedName, reportedBy, reportedAt]
    );
    return this.rowToCandidate(result.rows[0]);
  }

  async ingestEvidence(params: {
    candidateId: string;
    sourceId: string;
    sourceFamily: SourceFamily;
    observedAt: Date;
    rawScore: number;
    decayHalfLifeSeconds: number;
    synthetic?: boolean;
    provenanceJson?: Record<string, any>;
  }): Promise<DarkEvidence> {
    const evidenceId = `EVID-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const freshnessWeight = calculateFreshnessWeight(params.observedAt, params.decayHalfLifeSeconds);
    const contribution = calculateContribution(params.sourceFamily, params.rawScore, freshnessWeight);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
        INSERT INTO dark_corridor_evidence (
          evidence_id, candidate_id, source_id, source_family, observed_at,
          raw_score, freshness_weight, contribution, synthetic, provenance_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          evidenceId,
          params.candidateId,
          params.sourceId,
          params.sourceFamily,
          params.observedAt,
          params.rawScore,
          freshnessWeight,
          contribution,
          params.synthetic ?? false,
          params.provenanceJson ?? {}
        ]
      );

      // Transition to EVIDENCE_GATHERING if currently REPORTED
      await client.query(
        `
        UPDATE dark_corridor_candidates
        SET candidate_status = 'EVIDENCE_GATHERING', last_evidence_at = $2
        WHERE candidate_id = $1 AND candidate_status = 'REPORTED'
        `,
        [params.candidateId, params.observedAt]
      );

      await client.query('COMMIT');
      return this.rowToEvidence(result.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async recalculatePosterior(candidateId: string): Promise<{ posteriorScore: number; uncertainty: number }> {
    const res = await this.pool.query(
      `SELECT * FROM dark_corridor_evidence WHERE candidate_id = $1`,
      [candidateId]
    );
    const evidence: DarkEvidence[] = res.rows.map(r => this.rowToEvidence(r));
    if (evidence.length === 0) {
      return { posteriorScore: 0.0, uncertainty: 1.0 };
    }

    // Bayesian composite combination
    // P = 1 - Prod(1 - contribution_i)
    const product = evidence.reduce((acc, ev) => acc * (1 - ev.contribution), 1);
    const posteriorScore = Math.max(0.0, Math.min(1.0, 1 - product));

    // Uncertainty derived from evidence sparsity and family diversity (max 6 families)
    const families = new Set(evidence.map(e => e.sourceFamily));
    const diversityPenalty = Math.max(0, 1.0 - families.size / 6.0);
    const countPenalty = Math.max(0, 1.0 - evidence.length / 10.0);
    const uncertainty = Math.max(0.0, Math.min(1.0, (diversityPenalty + countPenalty) / 2.0));

    await this.pool.query(
      `
      UPDATE dark_corridor_candidates
      SET posterior_score = $2, uncertainty = $3
      WHERE candidate_id = $1
      `,
      [candidateId, posteriorScore, uncertainty]
    );

    return { posteriorScore, uncertainty };
  }

  async inferHypothesisPaths(candidateId: string, anchorPair: { from: string; to: string }): Promise<DarkCorridorPath[]> {
    // Ambiguity name resolution (Aura -> Aria, etc.)
    let canonicalName = anchorPair.from;
    if (anchorPair.from.toLowerCase() === 'aura') {
      canonicalName = 'Aria Subcounty';
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update candidate canonical name and status
      await client.query(
        `
        UPDATE dark_corridor_candidates
        SET canonical_name = $2, candidate_status = 'INFERENCE', geometry_status = 'RUNTIME_INFERRED'
        WHERE candidate_id = $1
        `,
        [candidateId, canonicalName]
      );

      // Clean existing paths
      await client.query(`DELETE FROM dark_corridor_paths WHERE candidate_id = $1`, [candidateId]);

      // Simulate 3 ranked paths based on least-cost terrain path
      const paths: DarkCorridorPath[] = [
        {
          pathId: `PATH-${candidateId}-1`,
          candidateId,
          rank: 1,
          posteriorMass: 0.48,
          geometryGeojson: {
            type: 'LineString',
            coordinates: [[31.18, 3.42], [31.05, 3.32], [30.85, 3.10]]
          },
          terrainCost: 1250.50,
          description: 'Aria-Koboko LCP via valley track'
        },
        {
          pathId: `PATH-${candidateId}-2`,
          candidateId,
          rank: 2,
          posteriorMass: 0.32,
          geometryGeojson: {
            type: 'LineString',
            coordinates: [[31.18, 3.42], [31.12, 3.25], [30.85, 3.10]]
          },
          terrainCost: 1840.20,
          description: 'Aria-Koboko eastern deflection path'
        },
        {
          pathId: `PATH-${candidateId}-3`,
          candidateId,
          rank: 3,
          posteriorMass: 0.20,
          geometryGeojson: {
            type: 'LineString',
            coordinates: [[31.18, 3.42], [30.98, 3.20], [30.85, 3.10]]
          },
          terrainCost: 2150.00,
          description: 'Aria-Koboko western high-slope track'
        }
      ];

      for (const p of paths) {
        await client.query(
          `
          INSERT INTO dark_corridor_paths (
            path_id, candidate_id, rank, posterior_mass, geometry_geojson, terrain_cost, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [p.pathId, p.candidateId, p.rank, p.posteriorMass, p.geometryGeojson, p.terrainCost, p.description]
        );
      }

      await client.query('COMMIT');
      return paths;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async sealAndPromote(
    candidateId: string,
    covenantContext: {
      ethicScore: number;
      ethicFlags: string[];
      culturalScore: number;
      culturalFlags: string[];
      biasScore: number;
      biasFlags: string[];
    }
  ): Promise<{ promoted: boolean; corridorId?: string; seal?: string; reason?: string }> {
    const candidateRes = await this.pool.query(
      `SELECT * FROM dark_corridor_candidates WHERE candidate_id = $1`,
      [candidateId]
    );
    const candidate: DarkCorridorCandidate = this.rowToCandidate(candidateRes.rows[0]);
    if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update status to GENESIS_REVIEW
      await client.query(
        `UPDATE dark_corridor_candidates SET candidate_status = 'GENESIS_REVIEW' WHERE candidate_id = $1`,
        [candidateId]
      );

      // Perform Covenant Integrity check
      const ethicApproved = covenantContext.ethicScore >= 0.8 && !covenantContext.ethicFlags.includes('no_consent');
      const biasApproved = covenantContext.biasScore >= 0.7;
      const scoreApproved = candidate.posteriorScore >= 0.55;

      const sealed = ethicApproved && biasApproved && scoreApproved;
      if (!sealed) {
        const explanation = {
          verdict: 'REJECTED',
          reason: `Ethic approved: ${ethicApproved}, Bias approved: ${biasApproved}, Score approved: ${scoreApproved} (score: ${candidate.posteriorScore})`,
          context: covenantContext,
          timestamp: new Date().toISOString()
        };
        await client.query(
          `
          UPDATE dark_corridor_candidates
          SET candidate_status = 'REJECTED', explanation_json = $2
          WHERE candidate_id = $1
          `,
          [candidateId, explanation]
        );
        await client.query('COMMIT');
        return { promoted: false, reason: explanation.reason };
      }

      const corridorId = `CORR-${candidate.candidateId}`;
      const qseal = `qseal:mo_covenant_check_v1:${crypto.createHash('sha256').update(candidateId + Date.now()).digest('hex')}`;

      // Insert into official corridor_definitions
      await client.query(
        `
        INSERT INTO corridor_definitions (
          corridor_id, name, status, geometry_type, start_node, end_node,
          created_at, updated_at
        ) VALUES ($1, $2, 'PROVISIONAL', 'RUNTIME_INFERRED', $3, 'Koboko', NOW(), NOW())
        `,
        [corridorId, candidate.canonicalName ?? candidate.reportedName, candidate.canonicalName ?? candidate.reportedName]
      );

      // Record covenant seal in transitions audit log
      const transitionId = `TRANS-GENESIS-${Date.now()}`;
      await client.query(
        `
        INSERT INTO corridor_state_transitions (
          transition_id, corridor_id, from_state, to_state, covenant_seal,
          approved_by, approved_at, transition_reason
        ) VALUES ($1, $2, 'REFERENCE', 'HYPOTHESIS', $3, 'mo-poe-covenant-dark-genesis-001', NOW(), $4)
        `,
        [transitionId, corridorId, qseal, `Genesis promotion of dark candidate: ${candidateId}`]
      );

      const explanation = {
        verdict: 'PROMOTED',
        corridorId,
        seal: qseal,
        timestamp: new Date().toISOString()
      };
      await client.query(
        `
        UPDATE dark_corridor_candidates
        SET candidate_status = 'PROMOTED', explanation_json = $2
        WHERE candidate_id = $1
        `,
        [candidateId, explanation]
      );

      await client.query('COMMIT');
      return { promoted: true, corridorId, seal: qseal };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  private rowToCandidate(r: any): DarkCorridorCandidate {
    return {
      candidateId: r.candidate_id,
      reportedName: r.reported_name,
      canonicalName: r.canonical_name,
      candidateStatus: r.candidate_status,
      posteriorScore: Number(r.posterior_score),
      uncertainty: Number(r.uncertainty),
      geometryStatus: r.geometry_status,
      fieldValidation: r.field_validation,
      synthetic: r.synthetic,
      reportedBy: r.reported_by,
      reportedAt: new Date(r.reported_at),
      createdAt: new Date(r.created_at),
      lastEvidenceAt: r.last_evidence_at ? new Date(r.last_evidence_at) : null,
      explanationJson: r.explanation_json
    };
  }

  private rowToEvidence(r: any): DarkEvidence {
    return {
      evidenceId: r.evidence_id,
      candidateId: r.candidate_id,
      sourceId: r.source_id,
      sourceFamily: r.source_family as SourceFamily,
      observedAt: new Date(r.observed_at),
      ingestedAt: new Date(r.ingested_at),
      rawScore: Number(r.raw_score),
      freshnessWeight: Number(r.freshness_weight),
      contribution: Number(r.contribution),
      synthetic: r.synthetic,
      provenanceJson: r.provenance_json
    };
  }
}
