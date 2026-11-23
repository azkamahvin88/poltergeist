/**
 * scoring.test.mjs — Tests for the haunting score formula.
 * Imports compiled output from dist/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHauntingScore, scoreToSeverity } from '../dist/analyzer/scoring.js';

function makeMetrics(overrides = {}) {
  return {
    path: 'test.ts',
    loc: 10,
    sloc: 10,
    functions: [],
    maxFunctionLength: 0,
    maxNestingDepth: 0,
    cyclomaticComplexity: 1,
    todos: [],
    exports: [],
    deadExports: [],
    duplicateBlocks: 0,
    imports: [],
    inCircularDependency: false,
    ...overrides,
  };
}

test('empty / clean file scores 0', () => {
  const score = computeHauntingScore(makeMetrics());
  assert.equal(score, 0);
});

test('score is always in [0, 100] for clean file', () => {
  const score = computeHauntingScore(makeMetrics());
  assert.ok(score >= 0 && score <= 100, `score ${score} out of bounds`);
});

test('score is in [0, 100] for heavily smelly file', () => {
  const score = computeHauntingScore(makeMetrics({
    loc: 1000,
    maxNestingDepth: 20,
    cyclomaticComplexity: 50,
    deadExports: [{ name: 'x', line: 1 }, { name: 'y', line: 2 },
                  { name: 'z', line: 3 }, { name: 'w', line: 4 }, { name: 'v', line: 5 }],
    duplicateBlocks: 10,
    todos: Array.from({ length: 15 }, (_, i) => ({ text: 'TODO', line: i, kind: 'TODO' })),
    inCircularDependency: true,
    maxFunctionLength: 200,
  }));
  assert.ok(score >= 0 && score <= 100, `score ${score} out of bounds`);
  assert.equal(score, 100);
});

test('adding dead exports increases score monotonically', () => {
  const base = computeHauntingScore(makeMetrics());
  const withDead = computeHauntingScore(makeMetrics({
    deadExports: [{ name: 'unused', line: 1 }],
  }));
  assert.ok(withDead >= base, `withDead(${withDead}) < base(${base})`);
});

test('adding nesting depth increases score monotonically', () => {
  const low = computeHauntingScore(makeMetrics({ maxNestingDepth: 2 }));
  const high = computeHauntingScore(makeMetrics({ maxNestingDepth: 5 }));
  assert.ok(high >= low, `high(${high}) < low(${low})`);
});

test('adding cyclomatic complexity increases score monotonically', () => {
  const low = computeHauntingScore(makeMetrics({ cyclomaticComplexity: 3 }));
  const high = computeHauntingScore(makeMetrics({ cyclomaticComplexity: 15 }));
  assert.ok(high >= low, `high(${high}) < low(${low})`);
});

test('circular dependency raises score', () => {
  const withoutCycle = computeHauntingScore(makeMetrics({ inCircularDependency: false }));
  const withCycle = computeHauntingScore(makeMetrics({ inCircularDependency: true }));
  assert.ok(withCycle > withoutCycle);
});

test('scoreToSeverity: 0 is calm', () => {
  assert.equal(scoreToSeverity(0), 'calm');
});

test('scoreToSeverity: 100 is cursed', () => {
  assert.equal(scoreToSeverity(100), 'cursed');
});

test('scoreToSeverity covers all ranges', () => {
  assert.equal(scoreToSeverity(10), 'calm');
  assert.equal(scoreToSeverity(35), 'eerie');
  assert.equal(scoreToSeverity(60), 'haunted');
  assert.equal(scoreToSeverity(90), 'cursed');
});

test('parse error produces score 0', () => {
  const score = computeHauntingScore(makeMetrics({ parseError: 'syntax error' }));
  assert.equal(score, 0);
});
