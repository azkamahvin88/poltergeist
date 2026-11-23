/**
 * seance.test.mjs — Tests for the séance Q&A engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../dist/analyzer/seance.js';

function makeResult(overrides = {}) {
  return {
    repoName: 'test-repo',
    analyzedAt: new Date().toISOString(),
    sessionId: 'test-session',
    files: [
      {
        path: 'src/parser.ts',
        hauntingScore: 72,
        metrics: {
          path: 'src/parser.ts',
          loc: 150,
          sloc: 150,
          functions: [
            { name: 'parseFile', startLine: 12, lengthLines: 40, nestingDepth: 2, cyclomaticComplexity: 5 },
            { name: 'extractTodos', startLine: 55, lengthLines: 20, nestingDepth: 1, cyclomaticComplexity: 3 },
          ],
          maxFunctionLength: 40,
          maxNestingDepth: 2,
          cyclomaticComplexity: 5,
          todos: [{ text: 'TODO: optimise this', line: 30, kind: 'TODO' }],
          exports: [{ name: 'parseFile', line: 12 }, { name: 'extractTodos', line: 55 }],
          deadExports: [],
          duplicateBlocks: 0,
          imports: [],
          inCircularDependency: false,
        },
        ghosts: [],
      },
      {
        path: 'src/scoring.ts',
        hauntingScore: 15,
        metrics: {
          path: 'src/scoring.ts',
          loc: 50,
          sloc: 50,
          functions: [
            { name: 'computeHauntingScore', startLine: 5, lengthLines: 30, nestingDepth: 1, cyclomaticComplexity: 2 },
          ],
          maxFunctionLength: 30,
          maxNestingDepth: 1,
          cyclomaticComplexity: 2,
          todos: [],
          exports: [{ name: 'computeHauntingScore', line: 5 }],
          deadExports: [],
          duplicateBlocks: 0,
          imports: [],
          inCircularDependency: false,
        },
        ghosts: [],
      },
    ],
    modules: [],
    totalGhosts: 0,
    overallScore: 50,
    ghosts: [],
    importGraph: [{ from: 'src/parser.ts', to: 'src/scoring.ts' }],
    cycles: [],
    ...overrides,
  };
}

test('"where is parseFile defined" returns correct file and line', () => {
  const result = makeResult();
  const response = query(result, 'where is parseFile defined?');
  assert.ok(response.answer.includes('src/parser.ts'), `answer missing file: ${response.answer}`);
  assert.ok(response.answer.includes('12') || response.citations.some(c => c.line === 12),
    'expected line 12 reference');
  assert.ok(response.citations.length > 0, 'expected citations');
});

test('"most haunted file" returns parser.ts (score 72)', () => {
  const result = makeResult();
  const response = query(result, 'what is the most haunted file?');
  assert.ok(response.answer.includes('src/parser.ts'), `answer: ${response.answer}`);
  assert.ok(response.answer.includes('72'), `expected score 72 in answer: ${response.answer}`);
  assert.ok(response.citations.length > 0);
});

test('"what depends on scoring.ts" returns parser.ts', () => {
  const result = makeResult();
  const response = query(result, 'what depends on src/scoring.ts?');
  assert.ok(response.answer.includes('src/parser.ts'), `answer: ${response.answer}`);
});

test('"where is nonexistent defined" returns not-found message', () => {
  const result = makeResult();
  const response = query(result, 'where is nonExistentSymbol defined?');
  assert.ok(response.answer.toLowerCase().includes("couldn't find"), `answer: ${response.answer}`);
});

test('unknown question returns helpful fallback with supported shapes', () => {
  const result = makeResult();
  const response = query(result, 'tell me a joke');
  assert.ok(response.answer.toLowerCase().includes("don't know"), `answer: ${response.answer}`);
  assert.ok(response.answer.includes('most haunted'), 'should list supported shapes');
});

test('"overall score" intent returns score', () => {
  const result = makeResult();
  const response = query(result, 'what is the overall score?');
  assert.ok(response.answer.includes('50'), `answer: ${response.answer}`);
});

test('"where is extractTodos defined" finds the right line', () => {
  const result = makeResult();
  const response = query(result, 'where is extractTodos defined');
  assert.ok(response.answer.includes('src/parser.ts'), `answer: ${response.answer}`);
  assert.ok(response.citations.some(c => c.file === 'src/parser.ts'), 'citation should reference parser.ts');
});
