import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const candidate = {
    candidate_id: "DARK-2026-001",
    reported_name: "Aura",
    canonical_name: null,
    alternate_spellings: ["Aria", "Ariwa"],
    reported_anchors: [
      {
        name: "Aura",
        lat: null,
        lng: null,
        resolution: "UNRESOLVED",
        note: "Do not auto-snap to Arua"
      },
      {
        name: "Koboko",
        lat: 3.39,
        lng: 30.96,
        resolution: "CONFIRMED"
      },
      {
        name: "South Sudan crossing",
        lat: null,
        lng: null,
        resolution: "UNKNOWN"
      }
    ],
    candidate_status: "EVIDENCE_GATHERING",
    posterior_score: 0.19,
    uncertainty: 0.81,
    geometry_status: "PENDING",
    field_validation: "PENDING",
    synthetic: false
  };

  return NextResponse.json([candidate]);
}
