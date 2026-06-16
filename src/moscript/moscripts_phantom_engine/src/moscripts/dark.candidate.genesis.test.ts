/**
 * ◉⟁⬡  MoStar Industries
 * Dark Corridor Candidate Genesis Engine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { DarkCandidateGenesisEngine } from './dark.candidate.genesis';
import { calculateFreshnessWeight, calculateContribution } from './evidenceFamilies';

describe('Dark Candidate Genesis Engine', () => {
  let mockPool: any;
  let mockClient: any;
  let engine: DarkCandidateGenesisEngine;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    engine = new DarkCandidateGenesisEngine(mockPool as unknown as Pool);
  });

  describe('Freshness Weight Decay', () => {
    it('should compute full weight (1.0) when observed now', () => {
      const now = new Date();
      const weight = calculateFreshnessWeight(now, 3600, now);
      expect(weight).toBeCloseTo(1.0, 5);
    });

    it('should decay to 0.5 at half-life limit', () => {
      const observed = new Date(Date.now() - 3600 * 1000);
      const now = new Date();
      const weight = calculateFreshnessWeight(observed, 3600, now);
      expect(weight).toBeCloseTo(0.5, 5);
    });
  });

  describe('Evidence Contribution', () => {
    it('should multiply raw score, freshness weight, and family weight correctly', () => {
      // FIELD_OBSERVATION weight is 0.25
      const contrib = calculateContribution('FIELD_OBSERVATION', 0.8, 0.5);
      expect(contrib).toBeCloseTo(0.10, 5);
    });
  });

  describe('Posterior Aggregation', () => {
    it('should aggregate empty evidence as 0.0 posterior and 1.0 uncertainty', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await engine.recalculatePosterior('DARK-CAND-001');
      expect(res.posteriorScore).toBe(0.0);
      expect(res.uncertainty).toBe(1.0);
    });

    it('should perform Bayesian combination on multiple evidence inputs', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            evidence_id: 'EVID-1',
            candidate_id: 'DARK-CAND-001',
            source_id: 'S-1',
            source_family: 'FIELD_OBSERVATION',
            observed_at: new Date().toISOString(),
            ingested_at: new Date().toISOString(),
            raw_score: 0.8,
            freshness_weight: 1.0,
            contribution: 0.2, // 0.8 * 1.0 * 0.25
            synthetic: false,
            provenance_json: '{}',
          },
          {
            evidence_id: 'EVID-2',
            candidate_id: 'DARK-CAND-001',
            source_id: 'S-2',
            source_family: 'CONFLICT_EVENT',
            observed_at: new Date().toISOString(),
            ingested_at: new Date().toISOString(),
            raw_score: 0.5,
            freshness_weight: 1.0,
            contribution: 0.1, // 0.5 * 1.0 * 0.20
            synthetic: false,
            provenance_json: '{}',
          }
        ]
      });

      const res = await engine.recalculatePosterior('DARK-CAND-001');
      // Bayesian composite = 1 - (1 - 0.2) * (1 - 0.1) = 1 - 0.8 * 0.9 = 1 - 0.72 = 0.28
      expect(res.posteriorScore).toBeCloseTo(0.28, 5);
      expect(res.uncertainty).toBeLessThan(1.0);
    });
  });

  describe('Hypothesis LCP Path Inference', () => {
    it('should resolve anchors (Aura -> Aria Subcounty) and populate path ranks', async () => {
      const paths = await engine.inferHypothesisPaths('DARK-CAND-001', { from: 'Aura', to: 'Koboko' });
      
      expect(paths.length).toBe(3);
      expect(paths[0].rank).toBe(1);
      expect(paths[0].posteriorMass).toBe(0.48);
      expect(paths[0].description).toContain('Aria-Koboko');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE dark_corridor_candidates'),
        expect.arrayContaining(['DARK-CAND-001', 'Aria Subcounty'])
      );
    });
  });

  describe('Covenant Seal & Promotion', () => {
    it('should reject candidates failing to meet the posterior threshold (0.55)', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            candidate_id: 'DARK-CAND-001',
            reported_name: 'Aura',
            canonical_name: 'Aria Subcounty',
            candidate_status: 'INFERENCE',
            posterior_score: 0.45,
            uncertainty: 0.35,
            geometry_status: 'RUNTIME_INFERRED',
            field_validation: 'PENDING',
            synthetic: false,
            reported_by: 'ANALYST',
            reported_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            last_evidence_at: null,
            explanation_json: '{}',
          }
        ]
      });

      const verdict = await engine.sealAndPromote('DARK-CAND-001', {
        ethicScore: 0.9,
        ethicFlags: [],
        culturalScore: 0.8,
        culturalFlags: [],
        biasScore: 0.8,
        biasFlags: [],
      });

      expect(verdict.promoted).toBe(false);
      expect(verdict.reason).toContain('Score approved: false');
    });

    it('should promote candidates passing score, ethic, and bias gates', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            candidate_id: 'DARK-CAND-001',
            reported_name: 'Aura',
            canonical_name: 'Aria Subcounty',
            candidate_status: 'INFERENCE',
            posterior_score: 0.68,
            uncertainty: 0.24,
            geometry_status: 'RUNTIME_INFERRED',
            field_validation: 'PENDING',
            synthetic: false,
            reported_by: 'ANALYST',
            reported_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            last_evidence_at: null,
            explanation_json: '{}',
          }
        ]
      });

      const verdict = await engine.sealAndPromote('DARK-CAND-001', {
        ethicScore: 0.95,
        ethicFlags: [],
        culturalScore: 0.8,
        culturalFlags: [],
        biasScore: 0.85,
        biasFlags: [],
      });

      expect(verdict.promoted).toBe(true);
      expect(verdict.corridorId).toBe('CORR-DARK-CAND-001');
      expect(verdict.seal).toContain('qseal:mo_covenant_check_v1');
    });
  });
});
