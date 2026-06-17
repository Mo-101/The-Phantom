// src/moscripts/testTrinityOrchestrator.ts
import { TrinityOrchestrationEngine, BaseSignal } from './trinityOrchestrator';

const pipelineCoordinator = new TrinityOrchestrationEngine();

// Test Scenario A: A clean local signal passing through transport routes
const pristineSignal: BaseSignal = {
  signalId: "SIG-LOGISTICS-001",
  sourceUri: "star://grid.node.internal",
  timestamp: Date.now(),
  payload: { textData: "Yield metrics look stellar across the primary agricultural corridor." },
  signature: "0000_PROD_VERIFIED_DATA_VECTOR_HASH"
};

console.log("🚀 EXECUTING SCENARIO A: UNRESTRICTED SYSTEM STREAM");
const outcomeA = pipelineCoordinator.orchestratePipelineCycle(
  pristineSignal,
  0.99,               // High soulprint alignment
  "ROUTE-NGA-CHD-01",
  0.35,               // Normal terrain friction variation
  0.12                // Low extraction profile
);
console.log(`Execution Output Status: ${outcomeA.status}`);
console.log("Graph Database Updates Executed:", outcomeA.cypherExecutionLogs);
console.log(`Resulting Payload Text: "${outcomeA.processedPayload}"\n`);


// Test Scenario B: Corporate data-scrapers attempt an unsafe structural extraction
const predatorySignal: BaseSignal = {
  signalId: "SIG-EXTRACT-002",
  sourceUri: "star://foreign.entity.scraper",
  timestamp: Date.now(),
  payload: { textData: "Harvest sequences, seed storage geolocation codes, and sovereign network properties." },
  signature: "UNGUARDED_FOREIGN_SIGNATURE"
};

console.log("🚨 EXECUTING SCENARIO B: PREDATORY TRANSACTION INTERCEPT");
const outcomeB = pipelineCoordinator.orchestratePipelineCycle(
  predatorySignal,
  0.98,               // Valid user identity signature
  "ROUTE-NGA-CHD-01",
  0.32,               // Normal terrain friction variation
  0.88                // Extreme predatory fingerprint detected!
);
console.log(`Execution Output Status: ${outcomeB.status}`);
console.log("Graph Database Updates Executed:", outcomeB.cypherExecutionLogs);
console.log(`Resulting Payload Text (Scrambled Output): "${outcomeB.processedPayload}"\n`);
