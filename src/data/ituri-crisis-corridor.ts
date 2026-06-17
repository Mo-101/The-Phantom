export type IturiEvidenceType =
  | "HEALTH"
  | "CONFLICT"
  | "DISPLACEMENT"
  | "ENTROPY"
  | "LINGUISTIC";

export type IturiSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type IturiPrecision = "PRECISE" | "SETTLEMENT" | "DISTRICT" | "INFERRED";

export interface IturiCoord {
  lat: number;
  lng: number;
  alt: number;
}

export interface IturiEvidence {
  id: string;
  day: number;
  km: number;
  type: IturiEvidenceType;
  tag: string;
  loc: string;
  cc: string;
  score: number;
  severity: IturiSeverity;
  affected?: number;
  casualties?: number;
  source: string;
  sourceId: string;
  sourceUrl?: string;
  prec: IturiPrecision;
  lat: number;
  lng: number;
  alt: number;
  timestamp: string;
  notes?: string;
}

export interface IturiNode extends IturiCoord {
  name: string;
  type: "start" | "phantom" | "border" | "crossing" | "end";
  cc: string;
  km: number;
  prec: IturiPrecision;
}

export interface IturiSoul {
  key: string;
  sym: string;
  s: string;
  name: string;
  weight: number;
  desc: string;
  value: number;
}

export const ITURI_CRISIS_CORRIDOR = {
  id: "CORRIDOR-CD-UG-ITU-001",
  short: "CD -> UG - ITU-001",
  region: "Ituri-West Nile - DRC / Uganda",
  startNode: "Mongwalu",
  endNode: "Arua",
  startCC: "CD",
  endCC: "UG",
  mode: "MIXED",
  velocityKmDay: 28,
  totalKm: 165,
  seasonal: false,
  canoe: false,
  detour: true,
  coverage:
    "Mining-town to formal border corridor; high mining-driven traffic plus active displacement under ADF pressure.",
  nearestFormal: "Mahagi-Goli border post",
  gapZone: true,
  firstDetected: "2026-05-15T12:00:00Z",
  activated: true,
  riskClass: "CRITICAL",
  score: 0.94,
  cameraCenter: {
    lat: 1.85,
    lng: 30.55,
    alt: 220000,
    tilt: 50,
    heading: 35,
  },
  pathCoords: [
    { lat: 1.9667, lng: 30.05, alt: 1180 },
    { lat: 1.85, lng: 30.15, alt: 1240 },
    { lat: 1.5667, lng: 30.25, alt: 1280 },
    { lat: 1.58, lng: 30.22, alt: 1290 },
    { lat: 1.95, lng: 30.55, alt: 920 },
    { lat: 2.3, lng: 30.98, alt: 740 },
    { lat: 2.34, lng: 31.005, alt: 720 },
    { lat: 3.02, lng: 30.91, alt: 1200 },
  ] satisfies IturiCoord[],
  nodes: [
    { name: "Mongwalu", lat: 1.9667, lng: 30.05, alt: 1180, type: "start", cc: "CD", km: 0, prec: "SETTLEMENT" },
    { name: "Bunia", lat: 1.5667, lng: 30.25, alt: 1280, type: "phantom", cc: "CD", km: 55, prec: "PRECISE" },
    { name: "Rwampara", lat: 1.58, lng: 30.22, alt: 1290, type: "phantom", cc: "CD", km: 60, prec: "DISTRICT" },
    { name: "Mahagi", lat: 2.3, lng: 30.98, alt: 740, type: "border", cc: "CD", km: 135, prec: "SETTLEMENT" },
    { name: "Goli", lat: 2.34, lng: 31.005, alt: 720, type: "crossing", cc: "UG", km: 140, prec: "SETTLEMENT" },
    { name: "Arua", lat: 3.02, lng: 30.91, alt: 1200, type: "end", cc: "UG", km: 165, prec: "PRECISE" },
  ] satisfies IturiNode[],
  engineInput: {
    gravityScore: 0.92,
    diffusionScore: 0.95,
    centralityScore: 0.78,
    hmmScore: 0.91,
    seasonalScore: 0.3,
    linguisticScore: 0.62,
    entropyScore: 0.88,
    frictionScore: 0.45,
  },
  evidence: [
    {
      id: "EVD-ITU-EBO-001",
      day: 0,
      km: 0,
      type: "HEALTH",
      tag: "EBOLA outbreak confirmed",
      loc: "Mongwalu",
      cc: "CD",
      score: 0.97,
      severity: "CRITICAL",
      affected: 146,
      casualties: 40,
      source: "AFRICA-CDC",
      sourceId: "ACDC-PR-20260515-EBOLA-DRC",
      sourceUrl: "https://africacdc.org/news-item/ebola-outbreak-drc-ituri-2026/",
      prec: "DISTRICT",
      lat: 1.9667,
      lng: 30.05,
      alt: 1180,
      timestamp: "2026-05-15T11:30:00Z",
      notes:
        "Mongwalu and Rwampara health zones; preliminary genetic testing flagged as non-Zaire strain in the seed briefing.",
    },
    {
      id: "EVD-ITU-EBO-002",
      day: 0,
      km: 60,
      type: "HEALTH",
      tag: "EBOLA zone affected",
      loc: "Rwampara",
      cc: "CD",
      score: 0.95,
      severity: "CRITICAL",
      affected: 100,
      casualties: 25,
      source: "AFRICA-CDC",
      sourceId: "ACDC-PR-20260515-EBOLA-DRC",
      prec: "DISTRICT",
      lat: 1.58,
      lng: 30.22,
      alt: 1290,
      timestamp: "2026-05-15T11:30:00Z",
    },
    {
      id: "EVD-ITU-EBO-003",
      day: 0,
      km: 55,
      type: "HEALTH",
      tag: "EBOLA transit risk",
      loc: "Bunia",
      cc: "CD",
      score: 0.78,
      severity: "HIGH",
      source: "WHO-DON",
      sourceId: "WHO-DON-2026-ITURI-001",
      prec: "PRECISE",
      lat: 1.5667,
      lng: 30.25,
      alt: 1280,
      timestamp: "2026-05-15T18:00:00Z",
      notes: "Bunia is the Ituri capital and a high-traffic transit hub from Mongwalu/Rwampara.",
    },
    {
      id: "EVD-ITU-EBO-004",
      day: 0,
      km: 140,
      type: "HEALTH",
      tag: "EBOLA imported case",
      loc: "Goli",
      cc: "UG",
      score: 0.92,
      severity: "HIGH",
      affected: 1,
      casualties: 1,
      source: "AFRICA-CDC",
      sourceId: "ACDC-PR-20260515-EBOLA-UGA",
      prec: "DISTRICT",
      lat: 2.34,
      lng: 31.005,
      alt: 720,
      timestamp: "2026-05-15T14:00:00Z",
      notes: "Uganda imported-case signal placed at the Mahagi-Goli crossing axis.",
    },
    {
      id: "EVD-ITU-ADF-001",
      day: -11,
      km: 0,
      type: "CONFLICT",
      tag: "ADF massacre - Makumo/Mabuo",
      loc: "Mambasa",
      cc: "CD",
      score: 0.99,
      severity: "CRITICAL",
      casualties: 50,
      source: "UN-OCHA",
      sourceId: "OCHA-DRC-20260511",
      sourceUrl: "https://english.news.cn/20260512/fca253cf1eb04d679404beef30d14541/c.html",
      prec: "SETTLEMENT",
      lat: 1.37,
      lng: 29.05,
      alt: 720,
      timestamp: "2026-05-11T00:00:00Z",
      notes: "ADF attacks reported around Makumo and Mabuo; residents killed, houses burned, residents missing.",
    },
    {
      id: "EVD-ITU-ADF-002",
      day: -60,
      km: 0,
      type: "CONFLICT",
      tag: "ADF sustained campaign",
      loc: "Mambasa",
      cc: "CD",
      score: 0.98,
      severity: "CRITICAL",
      casualties: 130,
      affected: 500,
      source: "AMNESTY",
      sourceId: "AI-DRC-20260505",
      sourceUrl:
        "https://www.amnesty.org/en/latest/news/2026/05/drc-rampant-adf-abuses-against-civilians-war-crimes-which-the-world-must-not-continue-to-ignore-new-report/",
      prec: "DISTRICT",
      lat: 1.37,
      lng: 29.05,
      alt: 720,
      timestamp: "2026-03-15T00:00:00Z",
      notes: "Seeded as a sustained Mambasa pressure event feeding displacement toward Ituri.",
    },
    {
      id: "EVD-ITU-ADF-003",
      day: -10,
      km: 0,
      type: "CONFLICT",
      tag: "ADF attack - fields",
      loc: "Oicha",
      cc: "CD",
      score: 0.94,
      severity: "HIGH",
      casualties: 19,
      source: "UN-OCHA",
      sourceId: "OCHA-DRC-20260508",
      prec: "SETTLEMENT",
      lat: 0.69,
      lng: 29.51,
      alt: 1100,
      timestamp: "2026-05-06T00:00:00Z",
      notes: "North Kivu/Ituri border pressure event; civilians attacked while working fields.",
    },
    {
      id: "EVD-ITU-DIS-001",
      day: -60,
      km: 0,
      type: "DISPLACEMENT",
      tag: "IDP flow - Mambasa to Tshopo",
      loc: "Mambasa",
      cc: "CD",
      score: 0.95,
      severity: "CRITICAL",
      affected: 68000,
      source: "IOM-DTM",
      sourceId: "DTM-DRC-ITU-MAR2026",
      prec: "DISTRICT",
      lat: 1.37,
      lng: 29.05,
      alt: 720,
      timestamp: "2026-05-08T00:00:00Z",
      notes: "Displacement pressure within Mambasa and into Tshopo since mid-March.",
    },
    {
      id: "EVD-ITU-DIS-002",
      day: -60,
      km: 0,
      type: "DISPLACEMENT",
      tag: "IDP flow - Beni/Lubero",
      loc: "Beni-Lubero",
      cc: "CD",
      score: 0.93,
      severity: "HIGH",
      affected: 310000,
      source: "IOM-DTM",
      sourceId: "DTM-DRC-NK-MAR2026",
      prec: "DISTRICT",
      lat: 0.5,
      lng: 29.47,
      alt: 1050,
      timestamp: "2026-05-08T00:00:00Z",
      notes: "Secondary displacement pressure into Ituri.",
    },
    {
      id: "EVD-ITU-ENT-001",
      day: -90,
      km: 55,
      type: "ENTROPY",
      tag: "Security vacuum",
      loc: "Ituri",
      cc: "CD",
      score: 0.91,
      severity: "HIGH",
      source: "AFRO-SENTINEL",
      sourceId: "AFROSEN-DRC-VACUUM-Q22026",
      prec: "DISTRICT",
      lat: 1.5667,
      lng: 30.25,
      alt: 1280,
      timestamp: "2026-02-15T00:00:00Z",
      notes: "Structural security-vacuum signal from FARDC south-draw and concurrent crisis pressure.",
    },
    {
      id: "EVD-ITU-LNG-001",
      day: -7,
      km: 140,
      type: "LINGUISTIC",
      tag: "Alur/Lugbara cross-border chatter",
      loc: "Mahagi-Goli",
      cc: "CD",
      score: 0.62,
      severity: "MODERATE",
      source: "AFRO-SENTINEL",
      sourceId: "AFROSEN-LNG-MAHAGI-20260509",
      prec: "INFERRED",
      lat: 2.3,
      lng: 30.98,
      alt: 740,
      timestamp: "2026-05-09T00:00:00Z",
      notes: "Cross-border language-community movement chatter near Mahagi-Goli.",
    },
  ] satisfies IturiEvidence[],
} as const;

export const ITURI_SOULS_PREVIEW: IturiSoul[] = [
  { key: "gravity", sym: "GR", s: "GR", name: "Gravity", weight: 0.18, desc: "Mining-town pull plus cross-border draw", value: 0.92 },
  { key: "diffusion", sym: "DI", s: "DI", name: "Diffusion", weight: 0.16, desc: "Active multi-modal flow under stress", value: 0.95 },
  { key: "centrality", sym: "CE", s: "CE", name: "Centrality", weight: 0.14, desc: "Bunia as regional choke point", value: 0.78 },
  { key: "hmm", sym: "HM", s: "HM", name: "HMM", weight: 0.14, desc: "Historical Ituri corridor pattern strong", value: 0.91 },
  { key: "seasonal", sym: "SE", s: "SE", name: "Seasonal", weight: 0.1, desc: "Weak seasonality, year-round passable", value: 0.3 },
  { key: "linguistic", sym: "LN", s: "LN", name: "Linguistic", weight: 0.1, desc: "Alur and Lugbara span the border", value: 0.62 },
  { key: "entropy", sym: "EN", s: "EN", name: "Entropy", weight: 0.1, desc: "High signal entropy from concurrent crises", value: 0.88 },
  { key: "friction", sym: "FR", s: "FR", name: "Friction", weight: 0.08, desc: "Moderate friction from terrain and insecurity", value: 0.45 },
];

export const ITURI_CORRIDOR_META = {
  id: ITURI_CRISIS_CORRIDOR.id,
  name: `${ITURI_CRISIS_CORRIDOR.startNode} -> ${ITURI_CRISIS_CORRIDOR.endNode}`,
  risk: ITURI_CRISIS_CORRIDOR.riskClass,
  km: ITURI_CRISIS_CORRIDOR.totalKm,
  mode: ITURI_CRISIS_CORRIDOR.mode.toLowerCase(),
  center: [ITURI_CRISIS_CORRIDOR.cameraCenter.lng, ITURI_CRISIS_CORRIDOR.cameraCenter.lat] as [number, number],
  zoom: 7,
};

export function getIturiLineCoordinates(): [number, number][] {
  return ITURI_CRISIS_CORRIDOR.pathCoords.map((coord) => [coord.lng, coord.lat]);
}

