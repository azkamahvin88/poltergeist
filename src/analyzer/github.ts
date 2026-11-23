/**
 * github.ts — Shared GitHub tarball fetch utility.
 * Used by both the HTTP server routes and the MCP server tools.
 */

import { request as httpsRequest } from 'node:https';
import { extractTarball } from './tarball.js';
import type { FileEntry } from './types.js';

export function parseGithubUrl(url: string): { owner: string; repo: string; ref: string } | null {
  const m = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:\/.*)?$/,
  );
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, ref: m[3] ?? 'HEAD' };
}

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET' }, (res) => {
      if (
        (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) &&
        res.headers.location
      ) {
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

export async function fetchGithubFiles(repoUrl: string): Promise<FileEntry[]> {
  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  const tarUrl = `https://codeload.github.com/${parsed.owner}/${parsed.repo}/tar.gz/${parsed.ref}`;
  const buf = await fetchUrl(tarUrl);
  return extractTarball(buf);
}
