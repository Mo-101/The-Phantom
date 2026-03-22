/**
 * ◉⟁⬡  MoStar Industries
 * MoScript — mo-corridor-detect-001
 *
 * Fetches signals from Neo4j and detects potential corridors.
 */

import { MoScript } from "./types";
import { SignalRepository } from "./signal.repository";

export const mo_CORRIDOR_DETECT: MoScript = {
  id: "mo-corridor-detect-001",
  name: "Neo4j-Driven Corridor Detection",
  trigger: "onSignalIngestComplete",
  inputs: ["signalRepo", "intelligenceEngine", "runId", "lookbackHours"],
  logic: async (inputs: Record<string, any>) => {
    const signalRepo = inputs.signalRepo as SignalRepository;
    const intelligenceEngine = inputs.intelligenceEngine;
    const runId = (inputs.runId as string) || "manual-detect";
    const lookbackHours = (inputs.lookbackHours as number) || 24;

    if (!signalRepo) {
      throw new Error("SignalRepository required for mo-corridor-detect-001");
    }

    console.log(`  🔍 [Run: ${runId}] Searching for corridors in the last ${lookbackHours} hours...`);

    // 1. Fetch recent signals from Neo4j
    const signals = await signalRepo.getSignalsByTimeRange(
      new Date(Date.now() - lookbackHours * 3600000).toISOString(),
      new Date().toISOString()
    );

    console.log(`  ✓  Retrieved ${signals.length} signals from Neo4j.`);

    // 2. Group by type and node
    const diseaseSignals = signals.filter(s => s.type === "disease");
    
    // 3. Simple detection logic
    if (diseaseSignals.length < 2) {
      return {
        corridorId: null,
        phantomActivated: false,
        runId,
        reason: "Insufficient disease signals for corridor detection."
      };
    }

    // Sort by timestamp
    diseaseSignals.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const first = diseaseSignals[0];
    const last = diseaseSignals[diseaseSignals.length - 1];

    const corridorId = `CORRIDOR-${first.nodeId}-${last.nodeId}-${Date.now().toString(36).toUpperCase()}`;
    
    // 4. Use Intelligence Engine if available
    if (intelligenceEngine) {
      const firstCoord = { 
        lat: first.lat || first.latitude || 0, 
        lng: first.lon || first.longitude || first.lng || 0 
      };
      const lastCoord = { 
        lat: last.lat || last.latitude || 0, 
        lng: last.lon || last.longitude || last.lng || 0 
      };
      
      const locationSignals = diseaseSignals.map(s => ({
        lat: s.lat || s.latitude || 0,
        lng: s.lon || s.longitude || s.lng || 0,
        confidence: s.truthScore || 0.8
      }));

      const signalHistory = diseaseSignals.map(s => s.magnitude || 0.5);

      const scoreResult = intelligenceEngine.synthesizeCorridorScore({
        corridorId,
        startNode: first.nodeId || first.location || "unknown-start",
        endNode: last.nodeId || last.location || "unknown-end",
        gravityScore: 0.8,
        diffusionScore: 0.7,
        centralityScore: 0.6,
        hmmScore: 0.9,
        seasonalScore: 0.5,
        linguisticScore: 0.4,
        entropyScore: 0.8,
        frictionScore: 0.7,
        inferredVelocityKmh: 18,
        runId,
        evidence: diseaseSignals.map(s => ({
          evidenceType: 'health_signal',
          description: `Disease signal at ${s.location}`,
          weight: 0.8,
          source: s.source,
          sourceRecordId: s.signalId || s.id,
          confidence: s.truthScore || 0.8,
          timestamp: s.timestamp,
          nodeIds: [s.nodeId || s.location || "unknown"]
        })),
        seasonallyActive: true,
        requiresCanoe: false,
        conflictDetour: false,
        signalHistory,
        frictionContext: {
          slopeDeg: 5,
          landCover: 'open_ground',
        },
        startCoord: firstCoord,
        endCoord: lastCoord,
        locationSignals
      });

      return {
        ...scoreResult,
        phantomActivated: scoreResult.corridorScore >= 0.60,
        evidenceCount: diseaseSignals.length,
        runId,
        timestamp: new Date().toISOString()
      };
    }

    // Fallback
    return {
      corridorId,
      startNode: first.nodeId,
      endNode: last.nodeId,
      corridorScore: 0.85,
      riskClass: "HIGH",
      phantomActivated: true,
      evidenceCount: diseaseSignals.length,
      runId,
      timestamp: new Date().toISOString()
    };
  },
  voiceLine: (result) =>
    result.phantomActivated
      ? `◉ PHANTOM POE DETECTED: ${result.corridorId} (Score: ${result.corridorScore}). The Grid remembers.`
      : `Grid silent. ${result.reason}`,
  sass: true,
};
