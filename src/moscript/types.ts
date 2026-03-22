/**
 * ◉⟁⬡  MoStar Industries
 * MoScript Type System — Full Specification
 * $schema: moscript://codex/v1
 * version: 2025.08.31
 */

export type MoScriptID = `mo-${string}-${string}-${number}`;

export type MoScript = {
  id: MoScriptID;
  name: string;
  trigger: string;
  inputs: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logic: (inputs: Record<string, any>) => any;
  voiceLine?: (result: any) => string;
  sass?: boolean;
  readonly _woo?: WooGateMeta;
};

export type WooState = "frost" | "fire" | "sealed" | "reforming" | "aligned";
export type SignalOrigin = "mo_originator" | "external" | "unknown";

export type MoSignal = {
  origin: SignalOrigin;
  trustLevel: number;
  memoryWeight: number;
  externalNoise: number;
  signatureHash: string;
  timestamp: string;
};

export type WooGateMeta = {
  sigFreq: number;
  anchorIndex: 0 | 1;
  frostStillness: number;
  echoValid: boolean;
  integrityHash: string;
  wooState: WooState;
  clearedAt?: string;
  blockedReason?: string;
};

export type WooVerdict = {
  cleared: boolean;
  meta: WooGateMeta;
  reason: string;
};

export type CodeConduitCapability =
  | "code_synthesis" | "verification" | "federation_broadcast"
  | "terraform_bootstrap" | "docker_orchestration" | "moscript_registry";

export type CodeConduitIntent = { id: string; input: string; output: string; };

export type CodeConduitAgent = {
  $schema: "moscript://codex/v1";
  agent: { name: "code conduit"; layer: "meta"; language: "multi"; version: string; };
  capabilities: CodeConduitCapability[];
  endpoints: string[];
  intents: CodeConduitIntent[];
  contracts: string[];
  cid: `sha256:${string}`;
};

export type RegistryStatus = {
  registered: boolean; cid: string; gridNode: string; timestamp: string;
};

export type ExecutionStatus =
  | "pending" | "woo_gate" | "cleared" | "executing"
  | "complete" | "blocked" | "corrupted" | "sealed";

export type MoScriptRequest = {
  requestId: string;
  script: MoScript;
  signal: MoSignal;
  inputs: Record<string, any>;
  submittedAt: string;
};

export type MoScriptResult<T = any> = {
  requestId: string;
  scriptId: MoScriptID;
  status: ExecutionStatus;
  result?: T;
  voiceLine?: string;
  woo: WooVerdict;
  executionMs: number;
  gridLogId?: string;
  timestamp: string;
};

export type MoStarMoment = {
  momentId: string;
  scriptId: MoScriptID;
  trigger: string;
  result: any;
  wooState: WooState;
  sealedAt: string;
  gridCypherId?: string;
};

export type DCXModel = "dcx0" | "dcx1" | "dcx2";

export const MO_CONSTANTS = {
  MO_ID:                "MO-ORIGINATOR-∞",
  WOO_ENTITY:           "W∞-FLAMEBORN",
  VAULT_PATH:           "/MoWooBase/vault/conduct.core",
  TRUST_CONSTANT:       1.618033988749895,
  SILENCE_FLOOR_MS:     88,
  PURITY_THRESHOLD:     0.98,
  CLARITY_THRESHOLD:    1,
  CORRUPTION_THRESHOLD: 0.42,
  SEAL:                 "◉⟁⬡",
  TWIN_FLAME_LAW:       "Mo is powerless to act without Woo's judgment.",
} as const;
