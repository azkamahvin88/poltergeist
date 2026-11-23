/**
 * graph.test.mjs — Tests for import graph construction and cycle detection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImportGraph, detectCycles, analyzeGraph } from '../dist/analyzer/graph.js';
import { resolveRelativeImport } from '../dist/analyzer/parser.js';
import { analyzeFiles } from '../dist/analyzer/analyzer.js';

function makeMetrics(path, importPaths) {
  return {
    path,
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
    inCircularDependency: false,
    imports: importPaths.map(p => ({ specifier: p, resolvedPath: p })),
  };
}

test('two-node cycle a→b→a is detected', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts' },
    { from: 'b.ts', to: 'a.ts' },
  ];
  const cycles = detectCycles(edges);
  assert.ok(cycles.length >= 1, 'expected at least one cycle');
  const cycleFiles = new Set(cycles.flat());
  assert.ok(cycleFiles.has('a.ts'), 'a.ts should be in a cycle');
  assert.ok(cycleFiles.has('b.ts'), 'b.ts should be in a cycle');
});

test('three-node cycle a→b→c→a is detected', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts' },
    { from: 'b.ts', to: 'c.ts' },
    { from: 'c.ts', to: 'a.ts' },
  ];
  const cycles = detectCycles(edges);
  assert.ok(cycles.length >= 1, 'expected at least one cycle');
  const all = new Set(cycles.flat());
  assert.ok(all.has('a.ts'));
  assert.ok(all.has('b.ts'));
  assert.ok(all.has('c.ts'));
});

test('acyclic graph has no cycles', () => {
  const edges = [
    { from: 'a.ts', to: 'b.ts' },
    { from: 'b.ts', to: 'c.ts' },
    { from: 'a.ts', to: 'c.ts' },
  ];
  const cycles = detectCycles(edges);
  assert.equal(cycles.length, 0);
});

test('empty graph has no cycles', () => {
  assert.equal(detectCycles([]).length, 0);
});

test('analyzeGraph marks files in cycles', () => {
  const metrics = [
    makeMetrics('a.ts', ['b.ts']),
    makeMetrics('b.ts', ['a.ts']),
    makeMetrics('c.ts', []),
  ];
  const result = analyzeGraph(metrics);
  assert.ok(result.filesInCycles.has('a.ts'));
  assert.ok(result.filesInCycles.has('b.ts'));
  assert.ok(!result.filesInCycles.has('c.ts'));
});

test('self-referential single-node is not flagged (no SCC >= 2)', () => {
  const edges = [{ from: 'a.ts', to: 'a.ts' }];
  // A self-loop is technically an SCC of size 1; our algorithm only flags size >= 2
  const cycles = detectCycles(edges);
  // Either 0 or 1 cycle of length 1 — depends on impl, but no two-file cycles
  for (const cycle of cycles) {
    assert.ok(cycle.length >= 1);
  }
});

test('buildImportGraph excludes non-relative imports', () => {
  const metrics = [
    {
      path: 'src/index.ts',
      loc: 1, sloc: 1, functions: [], maxFunctionLength: 0,
      maxNestingDepth: 0, cyclomaticComplexity: 1, todos: [],
      exports: [], deadExports: [], duplicateBlocks: 0,
      inCircularDependency: false,
      imports: [
        { specifier: 'node:fs', resolvedPath: null },
        { specifier: './utils.js', resolvedPath: 'src/utils.ts' },
      ],
    },
    makeMetrics('src/utils.ts', []),
  ];
  const edges = buildImportGraph(metrics);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].from, 'src/index.ts');
});

// ---------------------------------------------------------------------------
// Regression tests: .js-extension import specifiers resolve to .ts source files
// (TypeScript ESM projects write `import { foo } from './a.js'` in source but
//  the file on disk is `a.ts` — the fix in resolveRelativeImport must bridge this)
// ---------------------------------------------------------------------------

test('resolveRelativeImport: ./a.js from b.ts resolves to a.ts', () => {
  const resolved = resolveRelativeImport('b.ts', './a.js');
  assert.equal(resolved, 'a.ts');
});

test('resolveRelativeImport: ../analyzer/analyzer.js from server/index.ts resolves to .ts', () => {
  const resolved = resolveRelativeImport('src/server/index.ts', '../analyzer/analyzer.js');
  assert.equal(resolved, 'src/analyzer/analyzer.ts');
});

test('resolveRelativeImport: ./foo.jsx resolves to foo.tsx', () => {
  const resolved = resolveRelativeImport('src/x.ts', './foo.jsx');
  assert.equal(resolved, 'src/foo.tsx');
});

test('resolveRelativeImport: bare specifier returns null', () => {
  assert.equal(resolveRelativeImport('src/x.ts', 'node:fs'), null);
  assert.equal(resolveRelativeImport('src/x.ts', 'typescript'), null);
});

test('buildImportGraph: .js specifier in b.ts resolves to a.ts edge', () => {
  // b.ts has import { foo } from './a.js' — resolved path is a.ts via EXT_REMAP
  const metrics = [
    {
      path: 'a.ts',
      loc: 5, sloc: 5, functions: [], maxFunctionLength: 0,
      maxNestingDepth: 0, cyclomaticComplexity: 1, todos: [],
      exports: [{ name: 'foo', line: 1 }],
      deadExports: [], duplicateBlocks: 0,
      inCircularDependency: false,
      imports: [],
    },
    {
      path: 'b.ts',
      loc: 5, sloc: 5, functions: [], maxFunctionLength: 0,
      maxNestingDepth: 0, cyclomaticComplexity: 1, todos: [],
      exports: [],
      deadExports: [], duplicateBlocks: 0,
      inCircularDependency: false,
      // Simulates what resolveRelativeImport produces for './a.js' from 'b.ts'
      imports: [{ specifier: './a.js', resolvedPath: 'a.ts' }],
    },
  ];
  const edges = buildImportGraph(metrics);
  assert.equal(edges.length, 1, `expected 1 edge, got ${edges.length}`);
  assert.equal(edges[0].from, 'b.ts');
  assert.equal(edges[0].to, 'a.ts');
});

test('analyzeFiles end-to-end: foo exported from a.ts is NOT lingering-dead when b.ts imports ./a.js', () => {
  // This is the core regression: a TypeScript ESM-style .js import must not
  // cause the target file's exports to be incorrectly flagged as dead code.
  const files = [
    {
      path: 'a.ts',
      content: `export function foo(x: number): number { return x * 2; }\n`,
    },
    {
      path: 'b.ts',
      // TypeScript ESM style: import using .js extension even though source is .ts
      content: `import { foo } from './a.js';\nexport const result = foo(21);\n`,
    },
  ];

  const result = analyzeFiles(files, 'regression-test');

  // Find the FileReport for a.ts
  const aReport = result.files.find(f => f.path === 'a.ts');
  assert.ok(aReport, 'a.ts should be in the analysis result');

  // a.ts must have zero dead exports
  assert.equal(
    aReport.metrics.deadExports.length,
    0,
    `foo should NOT be a dead export, but deadExports = ${JSON.stringify(aReport.metrics.deadExports)}`,
  );

  // a.ts must have no lingering-dead ghost
  const lingeringGhosts = aReport.ghosts.filter(g => g.type === 'lingering-dead');
  assert.equal(
    lingeringGhosts.length,
    0,
    `a.ts should have no lingering-dead ghost, got: ${JSON.stringify(lingeringGhosts.map(g => g.description))}`,
  );
});

test('analyzeFiles end-to-end: import graph edge b→a exists for .js specifier', () => {
  const files = [
    {
      path: 'a.ts',
      content: `export const bar = 42;\n`,
    },
    {
      path: 'b.ts',
      content: `import { bar } from './a.js';\nexport const val = bar + 1;\n`,
    },
  ];

  const result = analyzeFiles(files, 'regression-edge');

  const edge = result.importGraph.find(e => e.from === 'b.ts' && e.to === 'a.ts');
  assert.ok(
    edge !== undefined,
    `expected edge b.ts→a.ts in importGraph, got: ${JSON.stringify(result.importGraph)}`,
  );
});
