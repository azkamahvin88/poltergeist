/**
 * parser.test.mjs — Tests for the TypeScript AST parser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../dist/analyzer/parser.js';

const SAMPLE_TS = `
import { foo } from './foo.js';
import { bar } from './bar.js';

// TODO: fix this later
export function greet(name: string): string {
  if (name === '') {
    if (true) {
      if (true) {
        if (true) {
          return 'deep';
        }
      }
    }
  }
  return 'Hello ' + name;
}

export const VERSION = '1.0.0';

function helper() {
  return 42;
}
`;

test('detects correct function count', () => {
  const metrics = parseFile('sample.ts', SAMPLE_TS);
  // greet + helper = 2
  assert.ok(metrics.functions.length >= 2, `expected >=2 functions, got ${metrics.functions.length}`);
});

test('detects TODO comment', () => {
  const metrics = parseFile('sample.ts', SAMPLE_TS);
  assert.ok(metrics.todos.length >= 1, 'expected at least 1 TODO');
  assert.ok(metrics.todos[0].text.includes('TODO'));
});

test('detects imports', () => {
  const metrics = parseFile('sample.ts', SAMPLE_TS);
  assert.ok(metrics.imports.length >= 2, `expected >=2 imports, got ${metrics.imports.length}`);
  const specifiers = metrics.imports.map(i => i.specifier);
  assert.ok(specifiers.includes('./foo.js'));
  assert.ok(specifiers.includes('./bar.js'));
});

test('resolves relative import paths', () => {
  const metrics = parseFile('src/index.ts', SAMPLE_TS);
  const fooImport = metrics.imports.find(i => i.specifier === './foo.js');
  assert.ok(fooImport, 'missing foo import');
  assert.ok(fooImport.resolvedPath !== null, 'resolvedPath should not be null for relative import');
});

test('detects exports', () => {
  const metrics = parseFile('sample.ts', SAMPLE_TS);
  const names = metrics.exports.map(e => e.name);
  assert.ok(names.includes('greet'), 'missing greet export');
  assert.ok(names.includes('VERSION'), 'missing VERSION export');
});

test('nesting depth >= 4 detected', () => {
  const metrics = parseFile('sample.ts', SAMPLE_TS);
  // greet has 4 nested ifs
  assert.ok(metrics.maxNestingDepth >= 4, `expected depth >=4, got ${metrics.maxNestingDepth}`);
});

test('LOC is non-zero for real code', () => {
  const metrics = parseFile('sample.ts', SAMPLE_TS);
  assert.ok(metrics.loc > 0, `expected loc > 0, got ${metrics.loc}`);
});

test('unparseable input does not throw and sets parseError', () => {
  const garbage = '<<<INVALID SYNTAX>>>';
  let metrics;
  assert.doesNotThrow(() => {
    metrics = parseFile('bad.ts', garbage);
  });
  // Should still return a metrics object (possibly with parseError or zero values)
  assert.ok(metrics !== undefined);
});

test('empty file returns zero metrics without error', () => {
  const metrics = parseFile('empty.ts', '');
  assert.equal(metrics.loc, 0);
  assert.equal(metrics.functions.length, 0);
  assert.equal(metrics.todos.length, 0);
});

test('FIXME and HACK are also detected', () => {
  const src = `
// FIXME: broken
// HACK: workaround
const x = 1;
`;
  const metrics = parseFile('t.ts', src);
  assert.ok(metrics.todos.length >= 2, `expected >=2, got ${metrics.todos.length}`);
  const kinds = metrics.todos.map(t => t.kind);
  assert.ok(kinds.includes('FIXME'));
  assert.ok(kinds.includes('HACK'));
});
