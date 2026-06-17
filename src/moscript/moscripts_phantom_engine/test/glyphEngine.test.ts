import assert from 'node:assert/strict';
import { encodeLatin, decodeGlyphs, parseGlyphExpression } from '../src/moscripts/glyphEngine.js';
import { MoScriptEngine } from '../src/moscripts/runtime.js';
import { mo_COST_ALERT, mo_FWD_EFFICIENCY } from '../src/moscripts/scripts/logistics.js';

assert.equal(encodeLatin('PHANTOM 2026'), '🜏🜇🜀🜍🜓🜎🜌 🜜🜚🜜🜠');
assert.equal(decodeGlyphs('🜏🜇🜀🜍🜓🜎🜌'), 'PHANTOM');
assert.equal(parseGlyphExpression('🜂🜦🜞').type, 'join');

const engine = new MoScriptEngine();
engine.register(mo_FWD_EFFICIENCY);
engine.register(mo_COST_ALERT);

const shipments = [
  { forwarder: 'Alpha', route: 'Kenya-Malawi', cost: 1200, deliveryDays: 5, onTime: true, mode: 'air' },
  { forwarder: 'Alpha', route: 'Kenya-Malawi', cost: 1000, deliveryDays: 4, onTime: true, mode: 'air' },
  { forwarder: 'Beta', route: 'Kenya-Malawi', cost: 650, deliveryDays: 10, onTime: false, mode: 'sea' },
  { forwarder: 'Beta', route: 'Kenya-Malawi', cost: 600, deliveryDays: 9, onTime: true, mode: 'sea' },
];
const rank = await engine.fire('onCalculateResults', { shipmentData: shipments });
assert.equal(rank.length, 1);
assert.equal((rank[0].result as any).top.name, 'Alpha');
const savings = await engine.fire('onMonthlyTrendUpdate', { shipmentData: shipments, historical: [] });
assert.equal(savings.length, 1);
assert.equal((savings[0].result as any).best.route, 'Kenya-Malawi');
assert.throws(() => engine.register({ ...mo_FWD_EFFICIENCY, name: 'Fake overwrite' }), /Immutable/);
console.log('MoScript Glyph Engine tests passed.');
