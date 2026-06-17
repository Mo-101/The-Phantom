/**
 * Baseline Corridor Repository
 * Handles REFERENCE mode corridors and live-to-baseline comparisons
 */

import { Pool } from "pg";
import type { 
  BaselineCorridor, 
  LiveToBaselineMatch, 
  CorridorMode,
  CorridorEvidenceClass 
} from "./baseline.reference";

export class BaselineRepository {
  constructor(private readonly pool: Pool) {}

  // ═══════════════════════════════════════════════════════════════
  // Baseline Corridor CRUD
  // ═══════════════════════════════════════════════════════════════

  async upsertBaselineCorridors(corridors: BaselineCorridor[]): Promise<BaselineCorridor[]> {
    const client = await this.pool.connect();
    try {
      const results: BaselineCorridor[] = [];
      
      for (const c of corridors) {
        const result = await client.query(
          `
          INSERT INTO corridor_baselines (
            baseline_id, corridor_id, name, description,
            start_node, end_node, start_coord_lat, start_coord_lng,
            end_coord_lat, end_coord_lng, mode, evidence_class,
            baseline_score, historical_risk_class, typical_seasons,
            last_historical_activity, historical_disease_pattern,
            archived_at, archived_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (baseline_id) DO UPDATE SET
            baseline_score = EXCLUDED.baseline_score,
            historical_risk_class = EXCLUDED.historical_risk_class,
            typical_seasons = EXCLUDED.typical_seasons,
            last_historical_activity = EXCLUDED.last_historical_activity,
            historical_disease_pattern = EXCLUDED.historical_disease_pattern,
            updated_at = NOW()
          RETURNING *
          `,
          [
            c.corridorId + '-BASELINE',
            c.corridorId,
            c.name,
            c.description,
            c.startNode,
            c.endNode,
            c.startCoord.lat,
            c.startCoord.lng,
            c.endCoord.lat,
            c.endCoord.lng,
            'REFERENCE',
            'HISTORICAL_BASELINE',
            c.baselineScore,
            c.historicalRiskClass,
            c.typicalSeasons,
            c.lastHistoricalActivity,
            c.historicalDiseasePattern,
            c.archivedAt,
            'system',
            'Archived via mo_ARCHIVE_HISTORICAL_BASELINE'
          ]
        );
        
        results.push(this.rowToBaselineCorridor(result.rows[0]));
      }
      
      return results;
    } finally {
      client.release();
    }
  }

  async getActiveReferenceCorridors(): Promise<BaselineCorridor[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM corridor_baselines
      WHERE mode = 'REFERENCE'
      ORDER BY baseline_score DESC
      `
    );
    
    return result.rows.map(row => this.rowToBaselineCorridor(row));
  }

  async getCorridorByBaselineId(baselineId: string): Promise<BaselineCorridor | null> {
    const result = await this.pool.query(
      `SELECT * FROM corridor_baselines WHERE baseline_id = $1`,
      [baselineId]
    );
    
    return result.rows[0] ? this.rowToBaselineCorridor(result.rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Live-to-Baseline Match Operations
  // ═══════════════════════════════════════════════════════════════

  async recordLiveBaselineMatch(match: LiveToBaselineMatch): Promise<LiveToBaselineMatch> {
    await this.pool.query(
      `
      INSERT INTO corridor_live_baseline_matches (
        match_id, live_signal_id, baseline_corridor_id,
        similarity, distance_km, spatial_overlap, temporal_alignment,
        disease_match, reactivates_historical, recommended_mode, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (match_id) DO NOTHING
      `,
      [
        match.matchId,
        match.liveSignalId,
        match.baselineCorridorId,
        match.similarity,
        match.distanceKm,
        match.spatialOverlap,
        match.temporalAlignment,
        match.diseaseMatch,
        match.reactivatesHistorical,
        match.recommendedMode,
        match.confidence
      ]
    );
    
    return match;
  }

  async getUnprocessedMatches(): Promise<LiveToBaselineMatch[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM corridor_live_baseline_matches
      WHERE processed = false
      ORDER BY similarity DESC
      `
    );
    
    return result.rows.map(row => this.rowToLiveToBaselineMatch(row));
  }

  async markMatchProcessed(matchId: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE corridor_live_baseline_matches
      SET processed = true, processed_at = NOW()
      WHERE match_id = $1
      `,
      [matchId]
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Corridor Mode State Management
  // ═══════════════════════════════════════════════════════════════

  async updateCorridorMode(
    corridorId: string, 
    mode: CorridorMode, 
    updates: Partial<BaselineCorridor>
  ): Promise<BaselineCorridor> {
    const setClauses: string[] = ['mode = $1', 'updated_at = NOW()'];
    const values: any[] = [mode];
    let paramIdx = 2;

    if (updates.live !== undefined) {
      setClauses.push(`live = $${paramIdx++}`);
      values.push(updates.live);
    }
    if (updates.liveActivatedAt) {
      setClauses.push(`live_activated_at = $${paramIdx++}`);
      values.push(updates.liveActivatedAt);
    }
    if (updates.evidenceClass) {
      setClauses.push(`evidence_class = $${paramIdx++}`);
      values.push(updates.evidenceClass);
    }
    if (updates.liveSignalCount !== undefined) {
      setClauses.push(`live_signal_count = $${paramIdx++}`);
      values.push(updates.liveSignalCount);
    }

    values.push(corridorId);

    const result = await this.pool.query(
      `
      UPDATE corridor_baselines
      SET ${setClauses.join(', ')}
      WHERE corridor_id = $${paramIdx}
      RETURNING *
      `,
      values
    );

    return this.rowToBaselineCorridor(result.rows[0]);
  }

  // ═══════════════════════════════════════════════════════════════
  // Comparison Engine
  // ═══════════════════════════════════════════════════════════════

  async compareLiveSignalsToBaselines(params: {
    liveSignals: Array<{
      signalId: string;
      lat: number;
      lng: number;
      timestamp: string;
      disease?: string;
      magnitude: number;
      confidence: number;
    }>;
    baselines: BaselineCorridor[];
  }): Promise<LiveToBaselineMatch[]> {
    const matches: LiveToBaselineMatch[] = [];

    for (const signal of params.liveSignals) {
      for (const baseline of params.baselines) {
        const match = this.calculateMatch(signal, baseline);
        if (match.similarity > 0.30) {  // Only store meaningful matches
          await this.recordLiveBaselineMatch(match);
          matches.push(match);
        }
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  private calculateMatch(
    signal: { signalId: string; lat: number; lng: number; timestamp: string; disease?: string },
    baseline: BaselineCorridor
  ): LiveToBaselineMatch {
    // Spatial similarity: distance from signal to corridor center
    const corridorCenter = {
      lat: (baseline.startCoord.lat + baseline.endCoord.lat) / 2,
      lng: (baseline.startCoord.lng + baseline.endCoord.lng) / 2,
    };
    
    const distanceKm = this.haversineDistance(
      signal.lat, signal.lng,
      corridorCenter.lat, corridorCenter.lng
    );
    
    const spatialSimilarity = Math.max(0, 1 - distanceKm / 100);
    
    // Disease pattern match
    const diseaseMatch = baseline.historicalDiseasePattern?.some(d => 
      d.toLowerCase() === signal.disease?.toLowerCase()
    ) ?? false;
    
    // Temporal alignment (signal within typical season)
    const signalDate = new Date(signal.timestamp);
    const month = signalDate.getMonth();
    const season = this.getSeasonFromMonth(month);
    const temporalAlignment = baseline.typicalSeasons?.includes(season) ? 1.0 : 0.5;
    
    // Composite similarity
    const similarity = 
      spatialSimilarity * 0.6 +
      (diseaseMatch ? 0.3 : 0) +
      temporalAlignment * 0.1;

    // Determine mode recommendation
    let recommendedMode: CorridorMode = 'REALTIME';
    let reactivatesHistorical = false;
    
    if (similarity > 0.70) {
      recommendedMode = 'HYBRID';
      reactivatesHistorical = true;
    } else if (similarity > 0.55) {
      recommendedMode = 'REALTIME';  // Strong correlation but not reactivation
    }

    return {
      matchId: `MATCH-${signal.signalId}-${baseline.corridorId}`,
      liveSignalId: signal.signalId,
      baselineCorridorId: baseline.corridorId,
      similarity: Math.round(similarity * 1000) / 1000,
      distanceKm: Math.round(distanceKm * 100) / 100,
      spatialOverlap: Math.round(spatialSimilarity * 1000) / 1000,
      temporalAlignment: Math.round(temporalAlignment * 1000) / 1000,
      diseaseMatch,
      reactivatesHistorical,
      recommendedMode,
      confidence: Math.round(similarity * 1000) / 1000,
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private getSeasonFromMonth(month: number): string {
    if (month >= 2 && month <= 4) return 'wet_onset';
    if (month >= 5 && month <= 8) return 'peak_wet';
    if (month >= 9 && month <= 10) return 'recession';
    return 'dry';
  }

  // ═══════════════════════════════════════════════════════════════
  // Row Mappers
  // ═══════════════════════════════════════════════════════════════

  private rowToBaselineCorridor(row: any): BaselineCorridor {
    return {
      corridorId: row.corridor_id,
      name: row.name,
      startNode: row.start_node,
      endNode: row.end_node,
      startCoord: { lat: row.start_coord_lat, lng: row.start_coord_lng },
      endCoord: { lat: row.end_coord_lat, lng: row.end_coord_lng },
      mode: row.mode as CorridorMode,
      evidenceClass: row.evidence_class as CorridorEvidenceClass,
      baselineScore: row.baseline_score,
      historicalRiskClass: row.historical_risk_class,
      typicalSeasons: row.typical_seasons || [],
      lastHistoricalActivity: row.last_historical_activity?.toISOString(),
      historicalDiseasePattern: row.historical_disease_pattern || [],
      live: row.live || false,
      liveActivatedAt: row.live_activated_at?.toISOString(),
      liveSignalCount: row.live_signal_count || 0,
      archivedAt: row.archived_at?.toISOString(),
      description: row.description || '',
    };
  }

  private rowToLiveToBaselineMatch(row: any): LiveToBaselineMatch {
    return {
      matchId: row.match_id,
      liveSignalId: row.live_signal_id,
      baselineCorridorId: row.baseline_corridor_id,
      similarity: row.similarity,
      distanceKm: row.distance_km,
      spatialOverlap: row.spatial_overlap,
      temporalAlignment: row.temporal_alignment,
      diseaseMatch: row.disease_match,
      reactivatesHistorical: row.reactivates_historical,
      recommendedMode: row.recommended_mode as CorridorMode,
      confidence: row.confidence,
    };
  }
}
