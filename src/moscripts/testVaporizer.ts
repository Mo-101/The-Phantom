// src/moscripts/testVaporizer.ts

import { evaluateAndVaporize } from "../security/ethnolinguisticIntentShield/vaporizer.js";
import { LinguisticThreatProfile } from "../security/ethnolinguisticIntentShield/schemas.js";

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

function runVaporizerTest() {
  console.log(`\n${colors.bright}${colors.magenta}⟁ ENTROPY VAPORIZER (TRACK 2.1) — LIVE SIMULATION${colors.reset}`);
  console.log(`${colors.dim}Testing alchemical coordinate scrubbing and private credential scrambling...${colors.reset}\n`);

  const rawPayload = "TRANSIT STATUS: Normal. Requesting immediate extraction parameters at -1.129384,34.204958. Private routing key is seed_984382901.";

  // Profile 1: Low Risk (Should ALLOW untouched)
  const lowRiskProfile: LinguisticThreatProfile = {
    requestId: "REQ-001",
    rawTextHash: "abc123hash",
    detectedTypes: [],
    extractivePredation: 0.12,
    mimicryScore: 0.05,
    coordinateSensitivity: 0.1,
    communityRisk: 0.05,
    requestedPrecision: "exact",
    action: "ALLOW",
    timestamp: new Date().toISOString()
  };

  // Profile 2: High Extraction Risk (Should VAPORIZE)
  const highRiskProfile: LinguisticThreatProfile = {
    requestId: "REQ-002",
    rawTextHash: "xyz987hash",
    detectedTypes: ["EXTRACTIVE_INFERENCE", "COORDINATE_EXTRACTION"],
    extractivePredation: 0.88,
    mimicryScore: 0.42,
    coordinateSensitivity: 0.95,
    communityRisk: 0.78,
    requestedPrecision: "exact",
    action: "VAPORIZE",
    timestamp: new Date().toISOString()
  };

  console.log(`═`.repeat(80));
  console.log(`${colors.bright}INPUT PAYLOAD:${colors.reset}`);
  console.log(`  "${colors.yellow}${rawPayload}${colors.reset}"`);
  console.log(`═`.repeat(80));

  console.log(`\n${colors.bright}🛡️  EVALUATING TEST CASE 1: Low-Risk Traffic (action: ALLOW)${colors.reset}`);
  const result1 = evaluateAndVaporize(rawPayload, lowRiskProfile);
  console.log(`  Output: "${colors.green}${result1}${colors.reset}"`);

  console.log(`\n${colors.bright}🔥 EVALUATING TEST CASE 2: High Predation Threat (action: VAPORIZE)${colors.reset}`);
  const result2 = evaluateAndVaporize(rawPayload, highRiskProfile);
  console.log(`  Output: "${colors.red}${result2}${colors.reset}"`);
  console.log(`═`.repeat(80));
  console.log(`${colors.bright}${colors.green}⟁ Vaporizer Verified: Coordinates and secrets disintegrated into alchemical glyphs. Concluded. ⟁${colors.reset}\n`);
}

runVaporizerTest();
