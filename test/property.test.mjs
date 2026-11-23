/**
 * property.test.mjs — fast-check property-based tests for Poltergeist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { computeHauntingScore, scoreToSeverity, computeModuleScore } from '../dist/analyzer/scoring.js';
import { detectDuplicates, countDuplicateBlocks } from '../dist/analyzer/duplicates.js';

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

const natMax = (max) => fc.integer({ min: 0, max });

const arbMetrics = fc.record({
  path: fc.constant('test.ts'),
  loc: natMax(2000),
  sloc: natMax(2000),
  maxNestingDepth: natMax(15),
  cyclomaticComplexity: fc.integer({ min: 1, max: 50 }),
  maxFunctionLength: natMax(300),
  inCircularDependency: fc.boolean(),
  todos: fc.array(fc.constant({ text: 'TODO', line: 1, kind: 'TODO' }), { maxLength: 20 }),
  deadExports: fc.array(fc.constant({ name: 'x', line: 1 }), { maxLength: 10 }),
  duplicateBlocks: natMax(10),
  functions: fc.constant([]),
  exports:   fc.constant([]),
  imports:   fc.constant([]),
});

// ---------------------------------------------------------------------------
// 1. Score bounds
// ---------------------------------------------------------------------------

test('PBT: score bounds [0,100] for any metrics', () => {
  fc.assert(
    fc.property(arbMetrics, (m) => {
      const s = computeHauntingScore(m);
      return s >= 0 && s <= 100;
    }),
    { numRuns: 500 },
  );
});

// ---------------------------------------------------------------------------
// 2. Monotonicity
// ---------------------------------------------------------------------------

test('PBT: adding a TODO never decreases score', () => {
  fc.assert(
    fc.property(arbMetrics, (m) => {
      const base  = computeHauntingScore(m);
      const worse = { ...m, todos: [...m.todos, { text: 'TODO', line: 1, kind: 'TODO' }] };
      return computeHauntingScore(worse) >= base;
    }),
    { numRuns: 300 },
  );
});

test('PBT: adding a dead export never decreases score', () => {
  fc.assert(
    fc.property(arbMetrics, (m) => {
      const base  = computeHauntingScore(m);
      const worse = { ...m, deadExports: [...m.deadExports, { name: 'zombie', line: 1 }] };
      return computeHauntingScore(worse) >= base;
    }),
    { numRuns: 300 },
  );
});

test('PBT: enabling circular dependency never decreases score', () => {
  fc.assert(
    fc.property(arbMetrics, (m) => {
      const a = computeHauntingScore({ ...m, inCircularDependency: false });
      const b = computeHauntingScore({ ...m, inCircularDependency: true });
      return b >= a;
    }),
    { numRuns: 300 },
  );
});

test('PBT: increasing nesting depth never decreases score', () => {
  fc.assert(
    fc.property(arbMetrics, fc.integer({ min: 1, max: 8 }), (m, extra) => {
      const base  = computeHauntingScore(m);
      const worse = { ...m, maxNestingDepth: m.maxNestingDepth + extra };
      return computeHauntingScore(worse) >= base;
    }),
    { numRuns: 300 },
  );
});

test('PBT: increasing duplicate blocks never decreases score', () => {
  fc.assert(
    fc.property(arbMetrics, fc.integer({ min: 1, max: 5 }), (m, extra) => {
      const base  = computeHauntingScore(m);
      const worse = { ...m, duplicateBlocks: m.duplicateBlocks + extra };
      return computeHauntingScore(worse) >= base;
    }),
    { numRuns: 300 },
  );
});

// ---------------------------------------------------------------------------
// 5. Module rollup stays in [0, 100]
// ---------------------------------------------------------------------------

test('PBT: module rollup score is always in [0, 100]', () => {
  const arbFileScores = fc.array(
    fc.record({
      hauntingScore: fc.integer({ min: 0, max: 100 }),
      loc: fc.integer({ min: 0, max: 5000 }),
    }),
    { minLength: 1, maxLength: 20 },
  );
  fc.assert(
    fc.property(arbFileScores, (files) => {
      const s = computeModuleScore(files);
      return s >= 0 && s <= 100;
    }),
    { numRuns: 300 },
  );
});

// ---------------------------------------------------------------------------
// 6. Duplicate detection properties
// ---------------------------------------------------------------------------

function makeBlock(n) {
  return Array.from({ length: n }, (_, i) => `  const var${i} = ${i * 7 + 3};`).join('\n');
}

test('PBT: 8-line shared block between two files is always detected as duplicate', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      (p1, p2) => {
        const block = makeBlock(8);
        const files = [
          { path: 'f1.ts', content: `// ${p1}\n${block}\nexport const x1 = 1;\n` },
          { path: 'f2.ts', content: `// ${p2}\n${block}\nexport const x2 = 2;\n` },
        ];
        const byFile = detectDuplicates(files);
        return countDuplicateBlocks(byFile, 'f1.ts') >= 1 &&
               countDuplicateBlocks(byFile, 'f2.ts') >= 1;
      },
    ),
    { numRuns: 100 },
  );
});

test('PBT: two files with fully unique 1-liners have zero duplicate blocks', () => {
  // Each file has lines that are unique across both files (seed ensures divergence)
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      (seed) => {
        // File A: lines 0..9 with seedA offset
        const makeLines = (offset) =>
          Array.from({ length: 10 }, (_, i) => `const v${offset + i} = ${offset + i};`).join('\n');
        const files = [
          { path: 'unique1.ts', content: makeLines(seed * 20) },
          { path: 'unique2.ts', content: makeLines(seed * 20 + 10) },
        ];
        const byFile = detectDuplicates(files);
        return countDuplicateBlocks(byFile, 'unique1.ts') === 0 &&
               countDuplicateBlocks(byFile, 'unique2.ts') === 0;
      },
    ),
    { numRuns: 200 },
  );
});
