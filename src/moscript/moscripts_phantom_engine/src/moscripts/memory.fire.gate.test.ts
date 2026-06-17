/**
 * ◉⟁⬡  MoStar Industries
 * Phantom POE — Memory-Predictive Fire Gate Tests
 */

import { computeMemoryInformedFireScore } from "./memory.informed.fire.gate";
import type { CorridorMemoryState } from "./covenant.state.transition";

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Memory-Predictive Fire Gate Tests                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let passed = 0;
  let failed = 0;

  // Test 1: REFERENCE corridor dampens signal
  const test1 = computeMemoryInformedFireScore(0.8, "REFERENCE");
  const expected1 = 0.8 * 0.85; // 0.68
  if (Math.abs(test1 - expected1) < 0.001) {
    console.log("✓ Test 1 PASSED: REFERENCE corridor dampens signal");
    console.log(`  Raw: 0.8 → Modulated: ${test1.toFixed(3)} (expected: ${expected1.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 1 FAILED: REFERENCE corridor dampens signal");
    console.log(`  Raw: 0.8 → Modulated: ${test1.toFixed(3)} (expected: ${expected1.toFixed(3)})`);
    failed++;
  }

  // Test 2: REALTIME corridor boosts signal
  const test2 = computeMemoryInformedFireScore(0.65, "REALTIME");
  const expected2 = 0.65 * 1.15; // 0.7475
  if (Math.abs(test2 - expected2) < 0.001) {
    console.log("✓ Test 2 PASSED: REALTIME corridor boosts signal");
    console.log(`  Raw: 0.65 → Modulated: ${test2.toFixed(3)} (expected: ${expected2.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 2 FAILED: REALTIME corridor boosts signal");
    console.log(`  Raw: 0.65 → Modulated: ${test2.toFixed(3)} (expected: ${expected2.toFixed(3)})`);
    failed++;
  }

  // Test 3: ARCHIVED corridor severely dampens
  const test3 = computeMemoryInformedFireScore(0.9, "ARCHIVED");
  const expected3 = 0.9 * 0.6; // 0.54
  if (Math.abs(test3 - expected3) < 0.001) {
    console.log("✓ Test 3 PASSED: ARCHIVED corridor severely dampens");
    console.log(`  Raw: 0.9 → Modulated: ${test3.toFixed(3)} (expected: ${expected3.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 3 FAILED: ARCHIVED corridor severely dampens");
    console.log(`  Raw: 0.9 → Modulated: ${test3.toFixed(3)} (expected: ${expected3.toFixed(3)})`);
    failed++;
  }

  // Test 4: Clamping to [0,1] - upper bound
  const test4 = computeMemoryInformedFireScore(1.2, "FIELD_CONFIRMED");
  const expected4 = 1.0; // clamped
  if (test4 === expected4) {
    console.log("✓ Test 4 PASSED: Clamping to [0,1] - upper bound");
    console.log(`  Raw: 1.2 → Modulated: ${test4.toFixed(3)} (expected: ${expected4.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 4 FAILED: Clamping to [0,1] - upper bound");
    console.log(`  Raw: 1.2 → Modulated: ${test4.toFixed(3)} (expected: ${expected4.toFixed(3)})`);
    failed++;
  }

  // Test 5: Clamping to [0,1] - lower bound
  const test5 = computeMemoryInformedFireScore(-0.1, "HYPOTHESIS");
  const expected5 = 0.0; // clamped
  if (test5 === expected5) {
    console.log("✓ Test 5 PASSED: Clamping to [0,1] - lower bound");
    console.log(`  Raw: -0.1 → Modulated: ${test5.toFixed(3)} (expected: ${expected5.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 5 FAILED: Clamping to [0,1] - lower bound");
    console.log(`  Raw: -0.1 → Modulated: ${test5.toFixed(3)} (expected: ${expected5.toFixed(3)})`);
    failed++;
  }

  // Test 6: HYPOTHESIS neutral factor
  const test6 = computeMemoryInformedFireScore(0.75, "HYPOTHESIS");
  const expected6 = 0.75 * 1.0; // 0.75
  if (Math.abs(test6 - expected6) < 0.001) {
    console.log("✓ Test 6 PASSED: HYPOTHESIS neutral factor");
    console.log(`  Raw: 0.75 → Modulated: ${test6.toFixed(3)} (expected: ${expected6.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 6 FAILED: HYPOTHESIS neutral factor");
    console.log(`  Raw: 0.75 → Modulated: ${test6.toFixed(3)} (expected: ${expected6.toFixed(3)})`);
    failed++;
  }

  // Test 7: FIELD_CONFIRMED highest boost
  const test7 = computeMemoryInformedFireScore(0.5, "FIELD_CONFIRMED");
  const expected7 = 0.5 * 1.2; // 0.6
  if (Math.abs(test7 - expected7) < 0.001) {
    console.log("✓ Test 7 PASSED: FIELD_CONFIRMED highest boost");
    console.log(`  Raw: 0.5 → Modulated: ${test7.toFixed(3)} (expected: ${expected7.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 7 FAILED: FIELD_CONFIRMED highest boost");
    console.log(`  Raw: 0.5 → Modulated: ${test7.toFixed(3)} (expected: ${expected7.toFixed(3)})`);
    failed++;
  }

  // Test 8: HYBRID moderate boost
  const test8 = computeMemoryInformedFireScore(0.7, "HYBRID");
  const expected8 = 0.7 * 1.1; // 0.77
  if (Math.abs(test8 - expected8) < 0.001) {
    console.log("✓ Test 8 PASSED: HYBRID moderate boost");
    console.log(`  Raw: 0.7 → Modulated: ${test8.toFixed(3)} (expected: ${expected8.toFixed(3)})`);
    passed++;
  } else {
    console.log("✗ Test 8 FAILED: HYBRID moderate boost");
    console.log(`  Raw: 0.7 → Modulated: ${test8.toFixed(3)} (expected: ${expected8.toFixed(3)})`);
    failed++;
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log(`  Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60) + "\n");

  return { passed, failed, total: passed + failed };
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

export { runTests };
