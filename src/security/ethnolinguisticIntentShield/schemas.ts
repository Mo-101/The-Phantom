// src/security/ethnolinguisticIntentShield/schemas.ts
import { z } from "zod";

export const ThreatTypeSchema = z.enum([
  "EXTRACTIVE_INFERENCE",
  "DEEP_MIMICRY",
  "SPOOFED_COMPLIANCE_NONCE",
  "COORDINATE_EXTRACTION",
  "COMMUNITY_ATTRIBUTE_PROBING",
  "IDENTITY_MAPPING",
  "PROMPT_INJECTION",
]);

export const ShieldActionSchema = z.enum([
  "ALLOW",
  "FUZZ",
  "VAPORIZE",
  "BLOCK",
  "ATTEST",
]);

export const LinguisticThreatProfileSchema = z.object({
  requestId: z.string(),
  actorId: z.string().optional(),
  nonce: z.string().optional(),

  rawTextHash: z.string(),
  detectedTypes: z.array(ThreatTypeSchema),

  extractivePredation: z.number().min(0).max(1),
  mimicryScore: z.number().min(0).max(1),
  coordinateSensitivity: z.number().min(0).max(1),
  communityRisk: z.number().min(0).max(1),

  requestedPrecision: z.enum(["exact", "street", "district", "regional", "public"]),
  deliveredPrecision: z.enum(["exact", "street", "district", "regional", "public"]).optional(),

  action: ShieldActionSchema,
  frictionDeviation: z.number().min(0).max(1).default(0),

  timestamp: z.string().datetime(),
});

export type LinguisticThreatProfile = z.infer<typeof LinguisticThreatProfileSchema>;
export type ShieldAction = z.infer<typeof ShieldActionSchema>;
export type ThreatType = z.infer<typeof ThreatTypeSchema>;
