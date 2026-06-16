import { describe, it, expect } from "vitest";

// Soul weights definition
const soulWeights = {
  gravity: 0.10,
  diffusion: 0.20,
  centrality: 0.15,
  hmm: 0.20,
  seasonal: 0.08,
  linguistic: 0.10,
  entropy: 0.12,
  terrain: 0.05
};

// Filter numeric values
function liveSouls(souls: Record<string, number | null>) {
  const live: Record<string, number> = {};
  for (const [key, value] of Object.entries(souls)) {
    if (value !== null && typeof value === "number") {
      live[key] = value;
    }
  }
  return live;
}

// Compute diagnostic composite
function diagnosticComposite(souls: Record<string, number | null>) {
  const live = liveSouls(souls);
  const keys = Object.keys(live);
  if (keys.length === 0) return null;

  let totalWeight = 0;
  let weightedSum = 0;
  for (const k of keys) {
    const w = soulWeights[k as keyof typeof soulWeights] || 0;
    const score = live[k];
    weightedSum += w * score;
    totalWeight += w;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// Law 7 cap function
function law7Cap(canonicalName: string | null, risk: string, state: string) {
  const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const stateOrder = ["dormant", "probing", "active_crossing", "surge"];

  let r = risk;
  let s = state;

  if (canonicalName === null) {
    if (riskOrder.indexOf(r) > riskOrder.indexOf("MEDIUM")) {
      r = "MEDIUM";
    }
    if (stateOrder.indexOf(s) > stateOrder.indexOf("probing")) {
      s = "probing";
    }
  }

  return { risk_class: r, latent_state: s };
}

// Promotion eligibility logic
interface Candidate {
  canonical_name: string | null;
  field_validation: string;
  soul_decomposition: Record<string, number | null>;
}
interface Evidence {
  source_family: string;
  synthetic: boolean;
}

function promotionEligible(candidate: Candidate, evidenceList: Evidence[]) {
  const souls = liveSouls(candidate.soul_decomposition);
  const nonSyntheticEvidence = evidenceList.filter(e => !e.synthetic);
  const families = new Set(nonSyntheticEvidence.map(e => e.source_family));

  const allNonSynthetic = evidenceList.every(e => !e.synthetic);

  return (
    Object.keys(souls).length === 8 &&
    families.size >= 2 &&
    allNonSynthetic &&
    candidate.field_validation === "PENDING" &&
    candidate.canonical_name !== null
  );
}

// Mock candidate matching Yumbe/Aura configuration
const candidate = {
  candidate_id: "DARK-2026-001",
  reported_name: "Aura",
  canonical_name: null,
  alternate_spellings: ["Aria", "Ariwa"],
  posterior_score: 0.19,
  uncertainty: 0.81,
  field_validation: "PENDING",
  soul_decomposition: {
    gravity: null,
    diffusion: null,
    centrality: null,
    hmm: null,
    seasonal: null,
    linguistic: null,
    entropy: 0.19,
    terrain: null
  }
};

const evidence = [
  { source_family: "EVENT_PRESSURE", synthetic: false }
];

describe("Dark Corridor Genesis Contract Tests", () => {
  it("Aura/Arua collision removed", () => {
    expect(candidate.alternate_spellings).not.toContain("Arua");
  });

  it("canonical_name remains NULL", () => {
    expect(candidate.canonical_name).toBeNull();
  });

  it("souls_live = 1 of 8", () => {
    const live = liveSouls(candidate.soul_decomposition);
    expect(Object.keys(live).length).toBe(1);
  });

  it("composite equals the one computed live soul", () => {
    const comp = diagnosticComposite(candidate.soul_decomposition);
    expect(comp).toBeCloseTo(0.19, 5);
  });

  it("posterior remains below 0.25", () => {
    expect(candidate.posterior_score).toBeLessThan(0.25);
  });

  it("Law 7 caps CRITICAL/surge to MEDIUM/probing", () => {
    const capped = law7Cap(candidate.canonical_name, "CRITICAL", "surge");
    expect(capped).toEqual({ risk_class: "MEDIUM", latent_state: "probing" });
  });

  it("promotion is blocked", () => {
    const eligible = promotionEligible(candidate, evidence);
    expect(eligible).toBe(false);
  });
});
