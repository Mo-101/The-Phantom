import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (id !== "DARK-2026-001") {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: "DENIED",
    candidate_id: "DARK-2026-001",
    reason: "Genesis requirements not satisfied",
    blockers: [
      "canonical_name is NULL",
      "all 8 souls are not computed",
      "at least 2 independent evidence families required",
      "field validation remains PENDING"
    ],
    allowed_state: "HYPOTHESIS",
    allowed_latent_state: "probing",
    allowed_risk_class: "MEDIUM"
  }, { status: 409 });
}
