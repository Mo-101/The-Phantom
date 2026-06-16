import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (id !== "DARK-2026-001") {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  return NextResponse.json({
    candidate_id: "DARK-2026-001",
    souls_live: 1,
    souls_total: 8,
    promotion_eligible: false,
    promotion_blockers: [
      "canonical_name unresolved",
      "only 1 of 8 souls computed",
      "fewer than 2 independent evidence families",
      "field validation pending"
    ],
    souls: {
      gravity: {
        weight: 0.10,
        score: null,
        status: "INSUFFICIENT_DATA"
      },
      diffusion: {
        weight: 0.20,
        score: null,
        status: "INSUFFICIENT_DATA"
      },
      centrality: {
        weight: 0.15,
        score: null,
        status: "INSUFFICIENT_DATA"
      },
      hmm: {
        weight: 0.20,
        score: null,
        status: "INSUFFICIENT_DATA"
      },
      seasonal: {
        weight: 0.08,
        score: null,
        status: "INSUFFICIENT_DATA"
      },
      linguistic: {
        weight: 0.10,
        score: null,
        status: "INSUFFICIENT_DATA"
      },
      entropy: {
        weight: 0.12,
        score: 0.19,
        status: "LIVE",
        basis: "Current event-pressure posterior"
      },
      terrain: {
        weight: 0.05,
        score: null,
        status: "INSUFFICIENT_DATA"
      }
    },
    diagnostic_composite: 0.19,
    promotion_composite: null,
    latent_state: "probing",
    risk_class: "MEDIUM",
    covenant_seal: null
  });
}
