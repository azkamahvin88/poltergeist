/**
 * index.ts — HTTP server entry point.
 * Node built-in http only. No framework.
 * Serves public/ as static files and routes /api/* requests.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { analyzeFiles, analyzeDirectory } from '../analyzer/analyzer.js';
import { extractTarball } from './tarball.js';
import { query as seanceQuery } from '../analyzer/seance.js';
import type { AnalysisResult, FileEntry } from '../analyzer/types.js';
import { request as httpsRequest } from 'node:https';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolvePath(__dirname, '../../public');
const REPO_ROOT = resolvePath(__dirname, '../../');
const JSON_LIMIT = 10 * 1024 * 1024; // 10 MB

// In-memory session store: sessionId → AnalysisResult
const sessions = new Map<string, AnalysisResult>();

// Content-type map for static serving
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > JSON_LIMIT) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET' }, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)
          && res.headers.location) {
        resolve(fetchUrl(res.headers.location));
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP_${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function parseGithubUrl(url: string): { owner: string; repo: string; ref: string } | null {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:\/.*)?$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, ref: m[3] ?? 'HEAD' };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleHealth(res: ServerResponse): Promise<void> {
  sendJson(res, 200, { status: 'ok' });
}

async function handleDemo(res: ServerResponse): Promise<void> {
  const result = await analyzeDirectory(REPO_ROOT);
  sessions.set(result.sessionId, result);
  sendJson(res, 200, result);
}

async function handleAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: Buffer;
  try {
    body = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'PAYLOAD_TOO_LARGE') {
      sendJson(res, 413, { error: 'payload_too_large', maxBytes: JSON_LIMIT });
    } else {
      sendJson(res, 500, { error: 'internal_error', message: msg });
    }
    return;
  }

  let parsed: { repoUrl?: string; url?: string; files?: FileEntry[] };
  try {
    parsed = JSON.parse(body.toString('utf8')) as typeof parsed;
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Invalid JSON body.' });
    return;
  }

  const repoUrl = parsed.repoUrl ?? parsed.url;
  const { files } = parsed;

  const hasUrl = typeof repoUrl === 'string' && repoUrl.length > 0;
  const hasFiles = Array.isArray(files) && files.length > 0;

  if (hasUrl === hasFiles) {
    sendJson(res, 400, { error: 'bad_request', message: "Provide exactly one of 'url' or 'files'." });
    return;
  }

  if (hasUrl && typeof repoUrl === 'string') {
    const gh = parseGithubUrl(repoUrl);
    if (!gh) {
      sendJson(res, 400, { error: 'bad_request', message: 'Invalid GitHub URL. Expected https://github.com/owner/repo' });
      return;
    }
    const tarUrl = `https://codeload.github.com/${gh.owner}/${gh.repo}/tar.gz/${gh.ref}`;
    let tarBuffer: Buffer;
    try {
      tarBuffer = await fetchUrl(tarUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('GitHub fetch failed', { url: tarUrl, err: msg });
      sendJson(res, 502, { error: 'github_unavailable', fallback: 'demo' });
      return;
    }
    let fileEntries: FileEntry[];
    try {
      fileEntries = extractTarball(tarBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 502, { error: 'tarball_extraction_failed', message: msg });
      return;
    }
    const result = analyzeFiles(fileEntries, `${gh.owner}/${gh.repo}`);
    sessions.set(result.sessionId, result);
    sendJson(res, 200, result);
    return;
  }

  if (hasFiles && Array.isArray(files)) {
    const result = analyzeFiles(files, 'uploaded');
    sessions.set(result.sessionId, result);
    sendJson(res, 200, result);
  }
}

async function handleSeance(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: Buffer;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Could not read body.' });
    return;
  }

  let parsed: { sessionId?: string; query?: string; question?: string; analysis?: AnalysisResult };
  try {
    parsed = JSON.parse(body.toString('utf8')) as typeof parsed;
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Invalid JSON body.' });
    return;
  }

  const question = parsed.query ?? parsed.question ?? '';
  const { sessionId } = parsed;

  if (!question) {
    sendJson(res, 400, { error: 'bad_request', message: "Missing 'query' field." });
    return;
  }

  let result: AnalysisResult | undefined;

  if (parsed.analysis) {
    result = parsed.analysis;
  } else if (sessionId) {
    result = sessions.get(sessionId);
    if (!result) {
      sendJson(res, 404, { error: 'session_not_found' });
      return;
    }
  } else {
    sendJson(res, 400, { error: 'bad_request', message: "Provide 'sessionId' or 'analysis'." });
    return;
  }

  const response = seanceQuery(result, question);
  sendJson(res, 200, response);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const filePath = url === '/' || !url.startsWith('/')
    ? join(PUBLIC_DIR, 'index.html')
    : join(PUBLIC_DIR, url.split('?')[0]!);

  // Prevent path traversal: resolved path must stay inside PUBLIC_DIR
  const resolved = resolvePath(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  try {
    const content = await readFile(resolved);
    const ext = extname(resolved).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length });
    res.end(content);
  } catch {
    // Fall back to index.html for SPA routing
    try {
      const content = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } catch {
      sendJson(res, 404, { error: 'not_found' });
    }
  }
}

// ---------------------------------------------------------------------------
// Router + server factory
// ---------------------------------------------------------------------------

async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  logger.info('request', { method, url });

  try {
    if (method === 'GET' && url === '/api/health') {
      await handleHealth(res);
    } else if (method === 'GET' && url.startsWith('/api/demo')) {
      await handleDemo(res);
    } else if (method === 'POST' && url.startsWith('/api/analyze')) {
      await handleAnalyze(req, res);
    } else if (method === 'POST' && url.startsWith('/api/seance')) {
      await handleSeance(req, res);
    } else if (!url.startsWith('/api/')) {
      await serveStatic(req, res);
    } else {
      sendJson(res, 404, { error: 'not_found' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('unhandled error', { url, method, err: msg });
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_error', message: msg });
    }
  }
}

export function createPoltergeistServer() {
  return createServer((req, res) => {
    void router(req, res);
  });
}

export function startServer(port: number): ReturnType<typeof createPoltergeistServer> {
  const server = createPoltergeistServer();
  server.listen(port, () => {
    logger.info('server started', { port });
  });
  return server;
}
