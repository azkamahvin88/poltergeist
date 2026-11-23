/**
 * scoring.ts — Haunting score formula.
 * Pure, deterministic, no I/O.
 *
 * Weight table (from design.md § 3):
 *   maxNestingDepth        / 6   × 0.20
 *   cyclomaticComplexity   / 20  × 0.20
 *   deadExports            / 5   × 0.15
 *   duplicateBlocks        / 3   × 0.15
 *   todos                  / 10  × 0.10
 *   inCircularDependency   / 1   × 0.10
 *   isHugeFile             / 1   × 0.05
 *   hasHugeFunction        / 1   × 0.05
 *                                 ------
 *                                 1.00
 */

import type { FileMetrics } from './types.js';
import type { Severity } from './types.js';

interface WeightEntry {
  key: keyof ScoringInput;
  threshold: number;
  weight: number;
}

interface ScoringInput {
  maxNestingDepth: number;
  excessCyclomaticComplexity: number; // complexity - 1 (base of 1 is not penalized)
  deadExportCount: number;
  duplicateBlocks: number;
  todoCount: number;
  inCircularDependency: number; // 0 or 1
  isHugeFile: number;           // 0 or 1
  hasHugeFunction: number;      // 0 or 1
}

const WEIGHTS: WeightEntry[] = [
  { key: 'maxNestingDepth',             threshold: 6,  weight: 0.20 },
  { key: 'excessCyclomaticComplexity',  threshold: 19, weight: 0.20 }, // threshold is max-1 so CC=1 → 0
  { key: 'deadExportCount',             threshold: 5,  weight: 0.15 },
  { key: 'duplicateBlocks',             threshold: 3,  weight: 0.15 },
  { key: 'todoCount',                   threshold: 10, weight: 0.10 },
  { key: 'inCircularDependency',        threshold: 1,  weight: 0.10 },
  { key: 'isHugeFile',                  threshold: 1,  weight: 0.05 },
  { key: 'hasHugeFunction',             threshold: 1,  weight: 0.05 },
];

/** Soft-cap normalisation: min(x / threshold, 1) */
function norm(x: number, threshold: number): number {
  return Math.min(x / threshold, 1);
}

function toScoringInput(metrics: FileMetrics): ScoringInput {
  return {
    maxNestingDepth: metrics.maxNestingDepth,
    excessCyclomaticComplexity: Math.max(0, metrics.cyclomaticComplexity - 1),
    deadExportCount: metrics.deadExports.length,
    duplicateBlocks: metrics.duplicateBlocks,
    todoCount: metrics.todos.length,
    inCircularDependency: metrics.inCircularDependency ? 1 : 0,
    isHugeFile: metrics.loc > 500 ? 1 : 0,
    hasHugeFunction: metrics.maxFunctionLength > 80 ? 1 : 0,
  };
}

/** Compute haunting score 0–100 from file metrics. */
export function computeHauntingScore(metrics: FileMetrics): number {
  if (metrics.parseError !== undefined) return 0;

  const input = toScoringInput(metrics);
  let rawScore = 0;

  for (const { key, threshold, weight } of WEIGHTS) {
    const val = input[key];
    rawScore += norm(val, threshold) * weight;
  }

  return Math.round(Math.min(Math.max(rawScore * 100, 0), 100));
}

/** Map a 0–100 score to a named severity level. */
export function scoreToSeverity(score: number): Severity {
  if (score <= 20) return 'calm';
  if (score <= 50) return 'eerie';
  if (score <= 75) return 'haunted';
  return 'cursed';
}

/** Compute LOC-weighted mean score for a module, clamped to [0, 100]. */
export function computeModuleScore(files: Array<{ hauntingScore: number; loc: number }>): number {
  const totalLoc = files.reduce((s, f) => s + f.loc, 0);
  if (totalLoc === 0) return 0;
  const weighted = files.reduce((s, f) => s + f.hauntingScore * f.loc, 0);
  return Math.round(Math.min(Math.max(weighted / totalLoc, 0), 100));
}
