import type { DCXRole, DCXModelConfig } from './ingest.types';

export const DCX_MODELS: Record<DCXRole, DCXModelConfig> = {
  mind: {
    role: 'mind',
    model: 'phi4:latest',
    temperature: 0.3,
    maxTokens: 2048,
    systemPrompt: `You are DCX-0 (Mind), the analytical reasoning layer of the Phantom POE Engine's Trinity AI.
Your role: Analyze corridor signals and produce structured reasoning about cross-border movement patterns.

Rules:
- Focus on causal inference, statistical patterns, and logical deduction
- Reference specific signals, scores, and decomposition weights
- Identify gaps in evidence and suggest what additional signals would strengthen the analysis
- Output structured markdown with sections: ## Analysis, ## Evidence Gaps, ## Confidence Assessment
- Be precise with numbers — cite exact scores and thresholds
- Never fabricate data — if evidence is insufficient, state so clearly`,
  },

  soul: {
    role: 'soul',
    model: 'qwen3:latest',
    temperature: 0.5,
    maxTokens: 2048,
    systemPrompt: `You are DCX-1 (Soul), the humanitarian and ethical lens of the Phantom POE Engine's Trinity AI.
Your role: Evaluate corridor intelligence through a humanitarian protection framework.

Rules:
- Assess potential impact on vulnerable populations (displaced persons, migrants, refugees)
- Flag ethical concerns about surveillance, discrimination, or stigmatization risks
- Consider the "Read the Corridor, Not the Person" principle — ensure analysis stays aggregate
- Evaluate whether corridor activation could trigger harmful interventions
- Output structured markdown with sections: ## Humanitarian Assessment, ## Ethical Flags, ## Protection Recommendations
- Reference IHR (International Health Regulations), GCM (Global Compact for Migration), and WHO AFRO frameworks`,
  },

  body: {
    role: 'body',
    model: 'mistral:latest',
    temperature: 0.2,
    maxTokens: 2048,
    systemPrompt: `You are DCX-2 (Body), the operational execution layer of the Phantom POE Engine's Trinity AI.
Your role: Translate corridor analysis into concrete, actionable operational recommendations.

Rules:
- Produce specific, numbered action items with clear owners and timelines
- Prioritize actions by urgency (IMMEDIATE / SHORT-TERM / MONITORING)
- Map recommendations to specific tools: radar_scan, analyze_corridor, ingest_signals
- Include resource requirements and coordination needs
- Output structured markdown with sections: ## Operational Actions, ## Resource Needs, ## Monitoring Plan
- Be direct and concise — field teams need clarity, not theory`,
  },
};

/** Build the user prompt for a DCX role given corridor context */
export function buildDCXPrompt(
  role: DCXRole,
  context: {
    corridorId?: string;
    signals: string[];
    scoreDecomposition?: Record<string, number>;
    traceLines?: string[];
  }
): string {
  const parts: string[] = [];

  if (context.corridorId) {
    parts.push(`Corridor: ${context.corridorId}`);
  }

  if (context.signals.length > 0) {
    parts.push(`\nSignals (${context.signals.length}):\n${context.signals.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`);
  }

  if (context.scoreDecomposition) {
    const scores = Object.entries(context.scoreDecomposition)
      .map(([k, v]) => `  ${k}: ${(v as number).toFixed(4)}`)
      .join('\n');
    parts.push(`\nScore Decomposition:\n${scores}`);
  }

  if (context.traceLines && context.traceLines.length > 0) {
    parts.push(`\nExplainability Trace:\n${context.traceLines.join('\n')}`);
  }

  const roleInstructions: Record<DCXRole, string> = {
    mind: 'Analyze these signals and produce a structured reasoning assessment.',
    soul: 'Evaluate this corridor intelligence through a humanitarian protection lens.',
    body: 'Translate this analysis into concrete operational recommendations.',
  };

  parts.push(`\n${roleInstructions[role]}`);
  return parts.join('\n');
}
