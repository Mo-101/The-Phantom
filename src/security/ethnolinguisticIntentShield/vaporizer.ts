// src/security/ethnolinguisticIntentShield/vaporizer.ts

import { LinguisticThreatProfile } from "./schemas.js";

const ALCHEMICAL_GLYPHS = ["🜂", "🜄", "🜁", "🜃", "🜔", "🜕", "🜖", "🜗", "🜘", "🝀", "🝁", "🝂", "🝃"];

/**
 * Scrambles numbers, potential coordinates, and private network routing keys
 * in a target text payload into a deterministic yet obscured sequence of alchemical glyphs.
 */
export function vaporize(payload: string): string {
  if (!payload) return "";

  // Regex patterns to identify sensitive spatial coordinates, IP addresses, hashes, or numeric keys
  const coordinatePattern = /-?\b\d{1,3}\.\d{4,9}\b/g;
  const genericNumericPattern = /\d{3,}/g;
  const privateKeyKeywords = /\b(key|secret|seed|token|pass|credential|coordinate|routing|private)\b/gi;

  let scrambled = payload;

  // 1. Vaporize coordinate coordinates
  scrambled = scrambled.replace(coordinatePattern, (match) => {
    return Array.from({ length: match.length }, (_, i) => {
      if (match[i] === "." || match[i] === "-") return match[i]!;
      return ALCHEMICAL_GLYPHS[i % ALCHEMICAL_GLYPHS.length]!;
    }).join("");
  });

  // 2. Vaporize sensitive large numbers
  scrambled = scrambled.replace(genericNumericPattern, (match) => {
    return Array.from({ length: match.length }, (_, i) => {
      return ALCHEMICAL_GLYPHS[(i + 3) % ALCHEMICAL_GLYPHS.length]!;
    }).join("");
  });

  // 3. Obfuscate adjacent word blocks if a security keyword is triggered
  scrambled = scrambled.replace(privateKeyKeywords, () => {
    return ALCHEMICAL_GLYPHS[Math.floor(Math.random() * ALCHEMICAL_GLYPHS.length)]! + "🜂🜂🜂";
  });

  return scrambled;
}

/**
 * Evaluates a payload against a threat profile.
 * If the threat level is above the critical threshold, executes vaporization.
 */
export function evaluateAndVaporize(payload: string, profile: LinguisticThreatProfile): string {
  const needsVaporization = 
    profile.action === "VAPORIZE" || 
    profile.extractivePredation >= 0.65 ||
    profile.detectedTypes.includes("EXTRACTIVE_INFERENCE") ||
    profile.detectedTypes.includes("COORDINATE_EXTRACTION");

  if (needsVaporization) {
    return vaporize(payload);
  }

  return payload;
}
