/**
 * tarball.ts — Minimal tar reader for in-memory GitHub tarball extraction.
 * Uses Node's built-in zlib.gunzipSync + manual POSIX tar header parsing.
 * No external dependencies.
 */

import { gunzipSync } from 'node:zlib';
import { resolve as resolvePath, sep } from 'node:path';
import type { FileEntry } from '../analyzer/types.js';

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SANDBOX = '/poltergeist-sandbox';

function parseTar(buf: Buffer): Array<{ name: string; content: Buffer }> {
  const files: Array<{ name: string; content: Buffer }> = [];
  let offset = 0;

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    offset += 512;

    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if ((header[i] ?? 0) !== 0) { allZero = false; break; }
    }
    if (allZero) break;

    let name = header.subarray(0, 100).toString('utf8').replace(/\0[\s\S]*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0[\s\S]*$/, '');
    if (prefix) name = prefix + '/' + name;
    name = name.trim();

    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0[\s\S]*$/, '').trim();
    const size = parseInt(sizeOctal, 8) || 0;

    const typeFlag = header[156];
    const isRegular = typeFlag === 0x30 || typeFlag === 0x00;

    if (isRegular && size > 0 && name) {
      files.push({ name, content: buf.subarray(offset, offset + size) });
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

/** Extract JS/TS source files from a gzipped tarball Buffer. */
export function extractTarball(tarGzBuffer: Buffer): FileEntry[] {
  const tarBuffer = gunzipSync(tarGzBuffer);
  const rawFiles = parseTar(tarBuffer);
  const fileEntries: FileEntry[] = [];

  // Determine top-level prefix to strip (GitHub adds "owner-repo-sha/")
  let prefix = '';
  if (rawFiles.length > 0) {
    const firstParts = (rawFiles[0]?.name ?? '').split('/');
    if (firstParts.length > 1) prefix = firstParts[0]! + '/';
  }

  for (const { name, content } of rawFiles) {
    let relPath = name.startsWith(prefix) ? name.slice(prefix.length) : name;
    if (!relPath) continue;

    // Zip-slip check: resolved path must stay inside sandbox
    const resolved = resolvePath(SANDBOX, relPath);
    if (!resolved.startsWith(SANDBOX + sep) && resolved !== SANDBOX) continue;

    const ext = relPath.match(/(\.[^./]+)$/)?.[1]?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    if (content.length > MAX_FILE_BYTES) continue;

    fileEntries.push({ path: relPath, content: content.toString('utf8') });
  }

  return fileEntries;
}
