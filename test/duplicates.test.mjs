/**
 * duplicates.test.mjs — Tests for duplicate block detection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDuplicates, countDuplicateBlocks } from '../dist/analyzer/duplicates.js';

// A block of 8 identical lines to trigger detection
const SHARED_BLOCK = `
const a = 1;
const b = 2;
const c = 3;
const d = 4;
const e = 5;
const f = 6;
const g = 7;
const h = 8;
`;

test('identical 8-line blocks in two files are detected', () => {
  const files = [
    { path: 'a.ts', content: `// file a\n${SHARED_BLOCK}\nexport const x = 1;` },
    { path: 'b.ts', content: `// file b\n${SHARED_BLOCK}\nexport const y = 2;` },
  ];
  const byFile = detectDuplicates(files);
  const countA = countDuplicateBlocks(byFile, 'a.ts');
  const countB = countDuplicateBlocks(byFile, 'b.ts');
  assert.ok(countA >= 1, `expected >=1 duplicate in a.ts, got ${countA}`);
  assert.ok(countB >= 1, `expected >=1 duplicate in b.ts, got ${countB}`);
});

test('completely different files are not flagged', () => {
  const files = [
    { path: 'x.ts', content: 'const apple = 1;\nconst banana = 2;\nconst cherry = 3;\n' },
    { path: 'y.ts', content: 'function hello() { return 42; }\nconst world = "hi";\nconst foo = 99;\n' },
  ];
  const byFile = detectDuplicates(files);
  assert.equal(countDuplicateBlocks(byFile, 'x.ts'), 0);
  assert.equal(countDuplicateBlocks(byFile, 'y.ts'), 0);
});

test('single file with no duplicates has count 0', () => {
  const files = [
    { path: 'solo.ts', content: 'export function foo() { return 1; }\nexport const bar = 2;\n' },
  ];
  const byFile = detectDuplicates(files);
  assert.equal(countDuplicateBlocks(byFile, 'solo.ts'), 0);
});

test('short files (< 6 lines) are not flagged', () => {
  const files = [
    { path: 'short1.ts', content: 'const a = 1;\nconst b = 2;\n' },
    { path: 'short2.ts', content: 'const a = 1;\nconst b = 2;\n' },
  ];
  const byFile = detectDuplicates(files);
  assert.equal(countDuplicateBlocks(byFile, 'short1.ts'), 0);
  assert.equal(countDuplicateBlocks(byFile, 'short2.ts'), 0);
});

test('duplicate within the same file is detected', () => {
  const block = `const p = 1;\nconst q = 2;\nconst r = 3;\nconst s = 4;\nconst t = 5;\nconst u = 6;\nconst v = 7;\n`;
  const files = [
    { path: 'self.ts', content: `${block}\n// separator\n${block}` },
  ];
  const byFile = detectDuplicates(files);
  const count = countDuplicateBlocks(byFile, 'self.ts');
  assert.ok(count >= 1, `expected >=1 self-duplicate, got ${count}`);
});
