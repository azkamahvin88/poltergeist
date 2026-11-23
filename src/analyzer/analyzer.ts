/**
 * analyzer.ts — Main orchestrator.
 * analyzeFiles(): run full pipeline on an in-memory list of files.
 * analyzeDirectory(): walk a local directory and call analyzeFiles().
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { parseFile } from './parser.js';
import { computeHauntingScore, computeModuleScore, scoreToSeverity } from './scoring.js';
import { detectDuplicates, countDuplicateBlocks } from './duplicates.js';
import { analyzeGraph } from './graph.js';
import { buildGhosts } from './ghosts.js';
import type {
  FileEntry,
  FileReport,
  ModuleRollup,
  AnalysisResult,
  Ghost,
  GhostType,
} from './types.js';

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output']);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Generate a UUID v4 (crypto-free, good enough for session IDs) */
function uuidv4(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 + 8) | 0];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}

/** Derive a module name (top-level directory, or "root" for files at the top level). */
function getModuleName(filePath: string): string {
  const parts = filePath.split('/');
  return parts.length > 1 ? (parts[0] ?? 'root') : 'root';
}

/**
 * Run the full analysis pipeline on an in-memory list of {path, content} pairs.
 * This is the core orchestration function.
 */
export function analyzeFiles(files: FileEntry[], projectName: string = 'unknown'): AnalysisResult {
  if (files.length === 0) {
    return emptyResult(projectName);
  }

  // 1. Parse all files
  const allMetrics = files.map((f) => parseFile(f.path, f.content));

  // 2. Detect duplicates across all files
  const duplicateMap = detectDuplicates(files);

  // 3. Build import graph and detect cycles
  const { edges, cycles, filesInCycles } = analyzeGraph(allMetrics);

  // 4. Find which cycle each file belongs to (use first cycle found)
  const fileCycleMap = new Map<string, string[]>();
  for (const cycle of cycles) {
    for (const f of cycle) {
      if (!fileCycleMap.has(f)) fileCycleMap.set(f, cycle);
    }
  }

  // 5. Build set of files that are imported by at least one other file.
  //    Uses the normalised .ts resolvedPath produced by resolveRelativeImport().
  //    A file that appears in this set has its exports treated as live.
  const importedFiles = new Set<string>();
  for (const metrics of allMetrics) {
    for (const imp of metrics.imports) {
      if (imp.resolvedPath) importedFiles.add(imp.resolvedPath);
    }
  }

  // 6. Apply cross-file results back into metrics, then build FileReports
  const fileReports: FileReport[] = allMetrics.map((metrics) => {
    // Dead exports: exports from files that are never imported
    const isImported = importedFiles.has(metrics.path);
    const deadExports = isImported ? [] : [...metrics.exports];

    const finalMetrics = {
      ...metrics,
      deadExports,
      duplicateBlocks: countDuplicateBlocks(duplicateMap, metrics.path),
      inCircularDependency: filesInCycles.has(metrics.path),
    };

    const duplicateBlockList = duplicateMap.get(metrics.path) ?? [];
    const cycle = fileCycleMap.get(metrics.path) ?? null;
    const ghosts = buildGhosts(finalMetrics, duplicateBlockList, cycle);
    const hauntingScore = computeHauntingScore(finalMetrics);

    return {
      path: metrics.path,
      metrics: finalMetrics,
      ghosts,
      hauntingScore,
    };
  });

  // 7. Build module rollups
  const moduleMap = new Map<string, FileReport[]>();
  for (const report of fileReports) {
    const mod = getModuleName(report.path);
    const arr = moduleMap.get(mod);
    if (arr) arr.push(report);
    else moduleMap.set(mod, [report]);
  }

  const modules: ModuleRollup[] = [];
  for (const [name, modFiles] of moduleMap) {
    const ghostCounts = new Map<GhostType, number>();
    for (const f of modFiles) {
      for (const g of f.ghosts) {
        ghostCounts.set(g.type, (ghostCounts.get(g.type) ?? 0) + 1);
      }
    }
    const topGhosts = [...ghostCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    modules.push({
      name,
      files: modFiles.map((f) => f.path),
      hauntingScore: computeModuleScore(modFiles.map((f) => ({ hauntingScore: f.hauntingScore, loc: f.metrics.loc }))),
      ghostCount: modFiles.reduce((s, f) => s + f.ghosts.length, 0),
      topGhosts,
    });
  }

  // 8. Global score
  const allGhosts: Ghost[] = fileReports.flatMap((f) => f.ghosts);
  const overallScore = computeModuleScore(
    fileReports.map((f) => ({ hauntingScore: f.hauntingScore, loc: f.metrics.loc })),
  );

  return {
    repoName: projectName,
    analyzedAt: new Date().toISOString(),
    sessionId: uuidv4(),
    files: fileReports,
    modules,
    totalGhosts: allGhosts.length,
    overallScore,
    ghosts: allGhosts,
    importGraph: edges,
    cycles,
  };
}

function emptyResult(projectName: string): AnalysisResult {
  return {
    repoName: projectName,
    analyzedAt: new Date().toISOString(),
    sessionId: uuidv4(),
    files: [],
    modules: [],
    totalGhosts: 0,
    overallScore: 0,
    ghosts: [],
    importGraph: [],
    cycles: [],
  };
}

/** Walk a directory recursively and collect eligible source files. */
async function walkDir(
  dir: string,
  rootDir: string,
  collected: Array<{ absPath: string; relPath: string }>,
  skipped: string[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.') continue;

    const absPath = join(dir, entry);
    let info;
    try {
      info = await stat(absPath);
    } catch {
      continue;
    }

    if (info.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      await walkDir(absPath, rootDir, collected, skipped);
    } else if (info.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      if (collected.length >= MAX_FILES) {
        skipped.push(relative(rootDir, absPath));
        continue;
      }

      if (info.size > MAX_FILE_BYTES) {
        skipped.push(relative(rootDir, absPath));
        continue;
      }

      collected.push({ absPath, relPath: relative(rootDir, absPath) });
    }
  }
}

/**
 * Walk a local directory, read eligible source files, and run analyzeFiles().
 * Skips node_modules, .git, dist, coverage, hidden dirs.
 * Caps at 500 files and 2 MB per file.
 */
export async function analyzeDirectory(rootDir: string): Promise<AnalysisResult> {
  const collected: Array<{ absPath: string; relPath: string }> = [];
  const skipped: string[] = [];

  await walkDir(rootDir, rootDir, collected, skipped);

  const files: FileEntry[] = [];
  for (const { absPath, relPath } of collected) {
    try {
      const content = await readFile(absPath, 'utf8');
      files.push({ path: relPath, content });
    } catch {
      skipped.push(relPath);
    }
  }

  const projectName = rootDir.split('/').pop() ?? rootDir;
  const result = analyzeFiles(files, projectName);

  if (skipped.length > 0) {
    result.skippedFiles = skipped;
  }

  return result;
}
