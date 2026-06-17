export type GlyphKind = 'letter' | 'digit' | 'operator' | 'element';

export type GlyphDefinition = Readonly<{
  glyph: string;
  latin: string;
  name: string;
  kind: GlyphKind;
  functionName: string;
  semantic?: string;
  phantomDomain?: string;
  fallback?: string;
}>;

export const PHANTOM_GLYPHS = [
  { glyph: '🜂', latin: 'Fire', name: 'Ikang', kind: 'element', functionName: 'signal_ignition', semantic: 'Fire', phantomDomain: 'Disease' },
  { glyph: '🜄', latin: 'Water', name: 'Mmọng', kind: 'element', functionName: 'displacement_flow', semantic: 'Water', phantomDomain: 'Movement' },
  { glyph: '🜁', latin: 'Air', name: 'Afim', kind: 'element', functionName: 'language_transmission', semantic: 'Air', phantomDomain: 'Conflict' },
  { glyph: '🜃', latin: 'Earth', name: 'Isong', kind: 'element', functionName: 'terrain_memory', semantic: 'Earth', phantomDomain: 'Terrain' },
  { glyph: '🜀', latin: 'A', name: 'A', kind: 'letter', functionName: 'letter_a' },
  { glyph: '🜁', latin: 'B', name: 'B', kind: 'letter', functionName: 'letter_b', semantic: 'Air' },
  { glyph: '🜂', latin: 'C', name: 'C', kind: 'letter', functionName: 'letter_c', semantic: 'Fire' },
  { glyph: '🜃', latin: 'D', name: 'D', kind: 'letter', functionName: 'letter_d', semantic: 'Earth' },
  { glyph: '🜄', latin: 'E', name: 'E', kind: 'letter', functionName: 'letter_e', semantic: 'Water' },
  { glyph: '🜅', latin: 'F', name: 'F', kind: 'letter', functionName: 'letter_f' },
  { glyph: '🜆', latin: 'G', name: 'G', kind: 'letter', functionName: 'letter_g' },
  { glyph: '🜇', latin: 'H', name: 'H', kind: 'letter', functionName: 'letter_h' },
  { glyph: '🜈', latin: 'I', name: 'I', kind: 'letter', functionName: 'letter_i' },
  { glyph: '🜉', latin: 'J', name: 'J', kind: 'letter', functionName: 'letter_j' },
  { glyph: '🜊', latin: 'K', name: 'K', kind: 'letter', functionName: 'letter_k' },
  { glyph: '🜋', latin: 'L', name: 'L', kind: 'letter', functionName: 'letter_l' },
  { glyph: '🜌', latin: 'M', name: 'M', kind: 'letter', functionName: 'letter_m' },
  { glyph: '🜍', latin: 'N', name: 'N', kind: 'letter', functionName: 'letter_n' },
  { glyph: '🜎', latin: 'O', name: 'O', kind: 'letter', functionName: 'letter_o' },
  { glyph: '🜏', latin: 'P', name: 'P', kind: 'letter', functionName: 'letter_p' },
  { glyph: '🜐', latin: 'Q', name: 'Q', kind: 'letter', functionName: 'letter_q' },
  { glyph: '🜑', latin: 'R', name: 'R', kind: 'letter', functionName: 'letter_r' },
  { glyph: '🜒', latin: 'S', name: 'S', kind: 'letter', functionName: 'letter_s' },
  { glyph: '🜓', latin: 'T', name: 'T', kind: 'letter', functionName: 'letter_t' },
  { glyph: '🜔', latin: 'U', name: 'U', kind: 'letter', functionName: 'letter_u' },
  { glyph: '🜕', latin: 'V', name: 'V', kind: 'letter', functionName: 'letter_v' },
  { glyph: '🜖', latin: 'W', name: 'W', kind: 'letter', functionName: 'letter_w' },
  { glyph: '🜗', latin: 'X', name: 'X', kind: 'letter', functionName: 'letter_x' },
  { glyph: '🜘', latin: 'Y', name: 'Y', kind: 'letter', functionName: 'letter_y' },
  { glyph: '🜙', latin: 'Z', name: 'Z', kind: 'letter', functionName: 'letter_z' },
  { glyph: '🜚', latin: '0', name: 'Zero', kind: 'digit', functionName: 'digit_0' },
  { glyph: '🜛', latin: '1', name: 'One', kind: 'digit', functionName: 'digit_1' },
  { glyph: '🜜', latin: '2', name: 'Two', kind: 'digit', functionName: 'digit_2' },
  { glyph: '🜝', latin: '3', name: 'Three', kind: 'digit', functionName: 'digit_3' },
  { glyph: '🜞', latin: '4', name: 'Four', kind: 'digit', functionName: 'digit_4' },
  { glyph: '🜟', latin: '5', name: 'Five', kind: 'digit', functionName: 'digit_5' },
  { glyph: '🜠', latin: '6', name: 'Six', kind: 'digit', functionName: 'digit_6' },
  { glyph: '🜡', latin: '7', name: 'Seven', kind: 'digit', functionName: 'digit_7' },
  { glyph: '🜢', latin: '8', name: 'Eight', kind: 'digit', functionName: 'digit_8' },
  { glyph: '🜣', latin: '9', name: 'Nine', kind: 'digit', functionName: 'digit_9' },
  { glyph: '🜤', latin: '→', name: 'Gate', kind: 'operator', functionName: 'gate', fallback: '->' },
  { glyph: '🜥', latin: '≥', name: 'Floor', kind: 'operator', functionName: 'floor', fallback: '>=' },
  { glyph: '🜦', latin: '·', name: 'Join', kind: 'operator', functionName: 'join', fallback: '.' },
  { glyph: '🜧', latin: '[', name: 'Open', kind: 'operator', functionName: 'open', fallback: '[' },
  { glyph: '🜨', latin: ']', name: 'Close', kind: 'operator', functionName: 'close', fallback: ']' },
  { glyph: '🜩', latin: ':', name: 'Define', kind: 'operator', functionName: 'define', fallback: ':' },
] as const satisfies readonly GlyphDefinition[];

export const LETTER_TO_GLYPH = Object.freeze(Object.fromEntries(PHANTOM_GLYPHS.filter(g => g.kind === 'letter').map(g => [g.latin, g.glyph]))) as Readonly<Record<string, string>>;
export const DIGIT_TO_GLYPH = Object.freeze(Object.fromEntries(PHANTOM_GLYPHS.filter(g => g.kind === 'digit').map(g => [g.latin, g.glyph]))) as Readonly<Record<string, string>>;
export const OPERATOR_TO_GLYPH = Object.freeze({ '->': '🜤', '>=': '🜥', '.': '🜦', '[': '🜧', ']': '🜨', ':': '🜩' } as const);
export const GLYPH_TO_LITERAL: Readonly<Record<string, string>> = Object.freeze(
  (PHANTOM_GLYPHS as readonly GlyphDefinition[]).reduce<Record<string, string>>((acc, g) => {
    if (g.kind === 'letter' || g.kind === 'digit') acc[g.glyph] = g.latin;
    if (g.kind === 'operator') acc[g.glyph] = g.fallback ?? g.latin;
    return acc;
  }, {}),
);
