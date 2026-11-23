/**
 * duplicates.ts — Duplicate block detection via normalised-line hashing.
 * Pure functions, deterministic, no I/O.
 *
 * Algorithm (design.md § 4):
 * 1. Normalise each line: trim, collapse whitespace, skip blanks/pure-comment lines.
 * 2. Build sliding windows of 6 consecutive normalised lines.
 * 3. Hash each window with FNV-1a 32-bit (pure TS, no native addons).
 * 4. Any hash appearing in 2+ locations → duplicate block → POLTERGEIST ghost.
 * 5. Overlapping windows from the same file pair (start diff ≤ 3) are merged.
 */

import type { FileEntry } from './types.js';

const WINDOW_SIZE = 6;

export interface DuplicateLocation {
  file: string;
  startLine: number; // 1-based
  endLine: number;   // 1-based
}

export interface DuplicateBlock {
  locations: [DuplicateLocation, DuplicateLocation]; // exactly two locations per pair
}

/** FNV-1a 32-bit hash (non-cryptographic, fast, pure TS) */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by FNV prime (32-bit), keeping within 32-bit unsigned
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

interface NormalisedLine {
  text: string;
  originalLine: number; // 1-based
}

/** Normalise source lines: strip blanks and pure-comment lines, trim/collapse whitespace. */
function normaliseLines(source: string): NormalisedLine[] {
  const result: NormalisedLine[] = [];
  const raw = source.split('\n');

  for (let i = 0; i < raw.length; i++) {
    const trimmed = (raw[i] ?? '').trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    // Collapse internal whitespace
    const normalised = trimmed.replace(/\s+/g, ' ');
    result.push({ text: normalised, originalLine: i + 1 });
  }

  return result;
}

interface WindowEntry {
  file: string;
  startLine: number;
  endLine: number;
}

/**
 * Detect duplicate blocks across a set of files.
 * Returns a Map from file path → list of DuplicateBlock pairs involving that file.
 */
export function detectDuplicates(files: FileEntry[]): Map<string, DuplicateBlock[]> {
  // Map from hash → list of window locations
  const hashMap = new Map<number, WindowEntry[]>();

  for (const { path, content } of files) {
    const lines = normaliseLines(content);
    if (lines.length < WINDOW_SIZE) continue;

    for (let i = 0; i <= lines.length - WINDOW_SIZE; i++) {
      const window = lines.slice(i, i + WINDOW_SIZE);
      const windowText = window.map((l) => l.text).join('\n');
      const hash = fnv1a32(windowText);

      const startLine = window[0]!.originalLine;
      const endLine = window[WINDOW_SIZE - 1]!.originalLine;

      const existing = hashMap.get(hash);
      if (existing) {
        existing.push({ file: path, startLine, endLine });
      } else {
        hashMap.set(hash, [{ file: path, startLine, endLine }]);
      }
    }
  }

  // Collect duplicate pairs
  const rawPairs: DuplicateBlock[] = [];
  for (const locations of hashMap.values()) {
    if (locations.length < 2) continue;
    // Emit pairs
    for (let i = 0; i < locations.length; i++) {
      for (let j = i + 1; j < locations.length; j++) {
        const a = locations[i]!;
        const b = locations[j]!;
        rawPairs.push({ locations: [a, b] });
      }
    }
  }

  // Merge overlapping pairs for the same (fileA, fileB) combination
  const mergedPairs = mergePairs(rawPairs);

  // Index by file
  const byFile = new Map<string, DuplicateBlock[]>();
  for (const block of mergedPairs) {
    const [a, b] = block.locations;
    addToMap(byFile, a.file, block);
    if (b.file !== a.file) {
      addToMap(byFile, b.file, block);
    }
  }

  return byFile;
}

function addToMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(value);
  } else {
    map.set(key, [value]);
  }
}

/** Merge duplicate-block pairs that overlap (start lines differ ≤ 3 for same file pair). */
function mergePairs(pairs: DuplicateBlock[]): DuplicateBlock[] {
  // Group by canonical file pair key
  const groups = new Map<string, DuplicateBlock[]>();

  for (const pair of pairs) {
    const [a, b] = pair.locations;
    const key = [a.file, b.file].sort().join('||');
    addToMap(groups, key, pair);
  }

  const result: DuplicateBlock[] = [];

  for (const group of groups.values()) {
    // Sort by startLine of first location
    group.sort((x, y) => x.locations[0]!.startLine - y.locations[0]!.startLine);

    const merged: DuplicateBlock[] = [];
    for (const pair of group) {
      if (merged.length === 0) {
        merged.push(pair);
        continue;
      }
      const last = merged[merged.length - 1]!;
      const [la] = last.locations;
      const [pa] = pair.locations;
      if (Math.abs(pa.startLine - la.startLine) <= 3) {
        // Merge: extend the end lines
        la.endLine = Math.max(la.endLine, pa.endLine);
        last.locations[1].endLine = Math.max(last.locations[1].endLine, pair.locations[1].endLine);
      } else {
        merged.push(pair);
      }
    }

    result.push(...merged);
  }

  return result;
}

/** Count duplicate blocks for a specific file path. */
export function countDuplicateBlocks(byFile: Map<string, DuplicateBlock[]>, filePath: string): number {
  return byFile.get(filePath)?.length ?? 0;
}
