import { createHash } from 'node:crypto';
import { encodeLatin, sealGlyphSource } from './glyphEngine.js';

export type JsonRecord = Record<string, unknown>;
export type MoScriptResult<T = unknown> = Readonly<{ scriptId: string; scriptName: string; trigger: string; seal: string; glyphSignature: string; timestamp: string; result: T; voiceLine?: string }>;
export type MoScript<TInput extends JsonRecord = JsonRecord, TResult = unknown> = Readonly<{ id: string; name: string; trigger: string; inputs: readonly (keyof TInput & string)[]; logic: (inputs: JsonRecord) => TResult | Promise<TResult>; voiceLine?: (result: TResult) => string; sass?: boolean }>;
export type RegisteredMoScript = MoScript & Readonly<{ seal: string; glyphSignature: string; registeredAt: string }>;

export class MoScriptError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: unknown) { super(message); this.name = 'MoScriptError'; }
}

function canonicalScriptPayload(script: MoScript): string {
  return JSON.stringify({ id: script.id, name: script.name, trigger: script.trigger, inputs: [...script.inputs].sort(), sass: Boolean(script.sass) });
}

export function sealMoScript(script: MoScript): string {
  return `sha256:${createHash('sha256').update(canonicalScriptPayload(script), 'utf8').digest('hex')}`;
}

function validateScript(script: MoScript): void {
  if (!script.id || !/^[a-z0-9][a-z0-9-]{2,80}$/i.test(script.id)) throw new MoScriptError(`Invalid MoScript id: ${script.id}`, 'INVALID_SCRIPT_ID');
  if (!script.name?.trim()) throw new MoScriptError('MoScript name is required', 'INVALID_SCRIPT_NAME');
  if (!script.trigger?.trim()) throw new MoScriptError('MoScript trigger is required', 'INVALID_TRIGGER');
  if (!Array.isArray(script.inputs)) throw new MoScriptError('MoScript inputs must be an array', 'INVALID_INPUTS');
  if (typeof script.logic !== 'function') throw new MoScriptError('MoScript logic must be a function', 'INVALID_LOGIC');
}

function pickInputs(context: JsonRecord, keys: readonly string[]): JsonRecord {
  const picked: JsonRecord = {};
  const missing: string[] = [];
  for (const key of keys) {
    if (!(key in context)) missing.push(key); else picked[key] = context[key];
  }
  if (missing.length) throw new MoScriptError(`Missing MoScript input(s): ${missing.join(', ')}`, 'MISSING_INPUTS', { missing });
  return picked;
}

export class MoScriptRegistry {
  private readonly byId = new Map<string, RegisteredMoScript>();
  private readonly byTrigger = new Map<string, Set<string>>();
  register(script: MoScript): RegisteredMoScript {
    validateScript(script);
    const existing = this.byId.get(script.id);
    const seal = sealMoScript(script);
    const glyphSignature = encodeLatin(script.id);
    if (existing && existing.seal !== seal) throw new MoScriptError(`Immutable MoScript id collision: ${script.id}`, 'IMMUTABLE_ID_COLLISION', { existingSeal: existing.seal, incomingSeal: seal });
    if (existing) return existing;
    const registered: RegisteredMoScript = Object.freeze({ ...script, seal, glyphSignature, registeredAt: new Date().toISOString() });
    this.byId.set(script.id, registered);
    const triggerSet = this.byTrigger.get(script.trigger) ?? new Set<string>();
    triggerSet.add(script.id);
    this.byTrigger.set(script.trigger, triggerSet);
    return registered;
  }
  get(id: string): RegisteredMoScript | undefined { return this.byId.get(id); }
  list(): RegisteredMoScript[] { return [...this.byId.values()]; }
  forTrigger(trigger: string): RegisteredMoScript[] { return [...(this.byTrigger.get(trigger) ?? [])].map(id => this.byId.get(id)).filter(Boolean) as RegisteredMoScript[]; }
}

export class MoScriptEngine {
  readonly registry = new MoScriptRegistry();
  private readonly auditLog: MoScriptResult[] = [];
  register(script: MoScript): RegisteredMoScript { return this.registry.register(script); }
  async fire<T = unknown>(trigger: string, context: JsonRecord): Promise<MoScriptResult<T>[]> {
    const scripts = this.registry.forTrigger(trigger);
    const results: MoScriptResult<T>[] = [];
    for (const script of scripts) {
      const inputs = pickInputs(context, script.inputs);
      const result = await script.logic(inputs);
      const receipt: MoScriptResult<T> = Object.freeze({
        scriptId: script.id, scriptName: script.name, trigger, seal: script.seal, glyphSignature: script.glyphSignature, timestamp: new Date().toISOString(), result: result as T, voiceLine: script.voiceLine ? script.voiceLine(result) : undefined,
      });
      this.auditLog.push(receipt);
      results.push(receipt);
    }
    return results;
  }
  audit(): MoScriptResult[] { return [...this.auditLog]; }
  sealGlyphSource(source: string): string { return sealGlyphSource(source); }
}
