# MoScripts Language Charter

**Status:** Foundational Canon  
**Language Family:** MoScripts  
**First Script System:** Phantom Script  
**Runtime Target:** MoScript Glyph Engine  
**Canonical Version:** v1.0

## 1. What MoScripts Is

MoScripts is the symbolic execution language of the MoStar / Phantom system. It has two layers: a human-operational TypeScript layer and a symbolic Phantom glyph layer.

MoScripts is not decorative syntax. A glyph is canonical only when it has a stable Unicode symbol, canonical name, role, fallback, and runtime behavior or documented semantic meaning.

## 2. The Law

1. **Meaning before ornament.** Every glyph must mean something before it looks beautiful.
2. **One base identity.** Each glyph has one primary identity. Secondary semantic binding is allowed only when explicit.
3. **No silent execution.** A MoScript must be registered, sealed, validated, and triggered before execution.
4. **No eval.** The runtime must never execute arbitrary glyph text as JavaScript. Glyph text is parsed into known tokens and AST nodes only.
5. **ID immutability.** A MoScript ID may not be overwritten with different metadata or logic after registration.
6. **Context honesty.** A script may only read the inputs declared in its `inputs` list.
7. **Audit everything.** Every execution returns structured metadata: script ID, trigger, seal, timestamp, result, and optional voice line.

## 3. Canonical System Layers

| Layer | Purpose |
|---|---|
| Phantom Script | Glyph alphabet, numerals, and operators |
| Glyph Engine | Encode, decode, tokenize, parse, normalize, and seal glyph scripts |
| MoScript Runtime | Register scripts, validate triggers, resolve inputs, execute logic |
| Registry | Holds scripts by immutable ID and trigger |
| Audit Chain | Records execution outputs and failures |

## 4. Canonical Runtime Shape

```ts
type MoScript = {
  id: string;
  name: string;
  trigger: string;
  inputs: string[];
  logic: (inputs: Record<string, unknown>) => unknown | Promise<unknown>;
  voiceLine?: (result: unknown) => string;
  sass?: boolean;
};
```

## 5. Canonical Execution Flow

1. Register script.
2. Seal canonical metadata.
3. Bind script to trigger.
4. Validate incoming context.
5. Extract declared inputs only.
6. Run script logic.
7. Generate optional voice line.
8. Return execution receipt.
9. Store or forward audit record.

## 6. Approved MoStar Colors

| Color | Meaning |
|---|---|
| Blue | intelligence, active signal, system interface |
| Yellow | value, priority, verification, energy |
| Black | authority, control, suppression, gate |
| White | neutral state, passive layer, abstraction |

A rendered icon should be one dominant color. Shading is allowed only to express volume.

## 7. Canonical Design Doctrine

Use the glyph table as source of truth. Keep operators small and sharp. Prefer deterministic parsing over magical interpretation. Add new glyph meanings only through versioned canon updates. Do not let the language become a costume party. The suit must fit.
