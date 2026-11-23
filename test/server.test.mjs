/**
 * server.test.mjs — Integration tests for the HTTP server.
 * Spins up on an ephemeral port, tests routes, then closes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPoltergeistServer } from '../dist/server/index.js';

let server;
let baseUrl;

before(async () => {
  server = createPoltergeistServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function post(path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body };
}

test('GET /api/health returns 200 ok', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
});

test('POST /api/analyze with inline files returns analysis', async () => {
  const files = [
    {
      path: 'index.ts',
      content: `
// TODO: remove this later
export function add(a: number, b: number): number {
  return a + b;
}
export const unused = 'nobody imports me';
export function multiply(a: number, b: number): number {
  return a * b;
}
`,
    },
  ];
  const { status, body } = await post('/api/analyze', { files });
  assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
  assert.ok(body.sessionId, 'missing sessionId');
  assert.ok(Array.isArray(body.files), 'missing files array');
  assert.equal(body.files.length, 1);
  assert.ok(typeof body.overallScore === 'number', 'missing overallScore');
  assert.ok(body.overallScore >= 0 && body.overallScore <= 100);
});

test('POST /api/analyze with no body returns 400', async () => {
  const { status, body } = await post('/api/analyze', {});
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_request');
});

test('POST /api/analyze with both url and files returns 400', async () => {
  const { status, body } = await post('/api/analyze', {
    url: 'https://github.com/owner/repo',
    files: [{ path: 'x.ts', content: '' }],
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_request');
});

test('POST /api/seance with unknown sessionId returns 404', async () => {
  const { status, body } = await post('/api/seance', {
    sessionId: 'does-not-exist',
    query: 'what is the most haunted file?',
  });
  assert.equal(status, 404);
  assert.equal(body.error, 'session_not_found');
});

test('POST /api/seance with inline analysis returns answer', async () => {
  // First create an analysis result
  const files = [
    {
      path: 'helpers.ts',
      content: `
export function computeScore(x: number): number { return x * 2; }
export function formatScore(s: number): string { return String(s); }
`,
    },
  ];
  const analyzeRes = await post('/api/analyze', { files });
  assert.equal(analyzeRes.status, 200);

  const { sessionId } = analyzeRes.body;
  const { status, body } = await post('/api/seance', {
    sessionId,
    query: 'where is computeScore defined?',
  });
  assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
  assert.ok(typeof body.answer === 'string', 'missing answer');
  assert.ok(body.answer.includes('computeScore'), `answer should reference computeScore: ${body.answer}`);
  assert.ok(Array.isArray(body.citations), 'missing citations');
});

test('GET /api/health is fast (< 500ms)', async () => {
  const start = Date.now();
  await get('/api/health');
  assert.ok(Date.now() - start < 500, 'health check too slow');
});
