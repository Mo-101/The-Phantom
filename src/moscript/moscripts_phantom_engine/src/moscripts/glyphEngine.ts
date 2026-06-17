import { createHash } from 'node:crypto';
import { DIGIT_TO_GLYPH, GLYPH_TO_LITERAL, LETTER_TO_GLYPH, OPERATOR_TO_GLYPH, PHANTOM_GLYPHS } from './glyphTable.js';

export type GlyphTokenKind = 'letter' | 'digit' | 'operator' | 'space' | 'unknown';
export type GlyphToken = Readonly<{ glyph: string; literal: string; kind: GlyphTokenKind; index: number }>;
export type GlyphAstNode =
  | Readonly<{ type: 'literal'; value: string }>
  | Readonly<{ type: 'join'; left: GlyphAstNode; right: GlyphAstNode }>
  | Readonly<{ type: 'define'; subject: GlyphAstNode; value: GlyphAstNode }>
  | Readonly<{ type: 'gate'; left: GlyphAstNode; right: GlyphAstNode }>
  | Readonly<{ type: 'floor'; left: GlyphAstNode; right: GlyphAstNode }>
  | Readonly<{ type: 'group'; body: GlyphAstNode }>;

const glyphKinds = new Map<string, GlyphTokenKind>();
for (const g of PHANTOM_GLYPHS) if (!glyphKinds.has(g.glyph)) glyphKinds.set(g.glyph, g.kind === 'element' ? 'letter' : g.kind);

export function encodeLatin(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const upper = ch.toUpperCase();
    if (LETTER_TO_GLYPH[upper]) out += LETTER_TO_GLYPH[upper];
    else if (DIGIT_TO_GLYPH[ch]) out += DIGIT_TO_GLYPH[ch];
    else if (ch === ' ') out += ' ';
    else out += ch;
  }
  return out;
}

export function decodeGlyphs(input: string): string {
  return Array.from(input).map(ch => GLYPH_TO_LITERAL[ch] ?? ch).join('');
}

export function tokenizeGlyphs(source: string): GlyphToken[] {
  return Array.from(source).map((glyph, index) => {
    if (glyph.trim() === '') return { glyph, literal: ' ', kind: 'space', index };
    return { glyph, literal: GLYPH_TO_LITERAL[glyph] ?? glyph, kind: glyphKinds.get(glyph) ?? 'unknown', index };
  });
}

export function normalizeGlyphSource(source: string): string {
  return Array.from(source).filter(ch => ch.trim() !== '').join('');
}

function splitTopLevel(source: string, operator: string): [string, string] | null {
  let depth = 0;
  const chars = Array.from(source);
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === '🜧') depth += 1;
    if (ch === '🜨') depth -= 1;
    if (depth === 0 && ch === operator) return [chars.slice(0, i).join(''), chars.slice(i + 1).join('')];
  }
  return null;
}

export function parseGlyphExpression(source: string): GlyphAstNode {
  const clean = normalizeGlyphSource(source);
  if (!clean) return { type: 'literal', value: '' };
  if (clean.startsWith('🜧') && clean.endsWith('🜨')) return { type: 'group', body: parseGlyphExpression(Array.from(clean).slice(1, -1).join('')) };
  const define = splitTopLevel(clean, '🜩');
  if (define) return { type: 'define', subject: parseGlyphExpression(define[0]), value: parseGlyphExpression(define[1]) };
  const gate = splitTopLevel(clean, '🜤');
  if (gate) return { type: 'gate', left: parseGlyphExpression(gate[0]), right: parseGlyphExpression(gate[1]) };
  const floor = splitTopLevel(clean, '🜥');
  if (floor) return { type: 'floor', left: parseGlyphExpression(floor[0]), right: parseGlyphExpression(floor[1]) };
  const join = splitTopLevel(clean, '🜦');
  if (join) return { type: 'join', left: parseGlyphExpression(join[0]), right: parseGlyphExpression(join[1]) };
  return { type: 'literal', value: decodeGlyphs(clean) };
}

export function sealGlyphSource(source: string): string {
  return `sha256:${createHash('sha256').update(normalizeGlyphSource(source), 'utf8').digest('hex')}`;
}

export function operatorGlyph(op: keyof typeof OPERATOR_TO_GLYPH): string { return OPERATOR_TO_GLYPH[op]; }
