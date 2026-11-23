/**
 * ghosts.ts — Ghost assembly from FileMetrics.
 * Builds Ghost records with ExorcismReports from computed metrics.
 * Pure functions, deterministic, no I/O.
 */

import type { FileMetrics, Ghost, GhostType, ExorcismReport, Severity, GhostDetails } from './types.js';
import { scoreToSeverity, computeHauntingScore } from './scoring.js';
import type { DuplicateBlock } from './duplicates.js';

function makeId(type: GhostType, file: string, line: number): string {
  return `${type}:${file}:${line}`;
}

function exorcism(
  displayName: string,
  explanation: string,
  fixSuggestion: string,
  estimatedScoreReduction: number,
): ExorcismReport {
  return { displayName, explanation, fixSuggestion, estimatedScoreReduction };
}

/** Build all ghosts for a single file given its final metrics and duplicate block data. */
export function buildGhosts(
  metrics: FileMetrics,
  duplicateBlocks: DuplicateBlock[],
  cycle: string[] | null,
): Ghost[] {
  const ghosts: Ghost[] = [];
  const severity: Severity = scoreToSeverity(computeHauntingScore(metrics));

  // --- The Lingering Dead (dead exports) ---
  if (metrics.deadExports.length > 0) {
    const details: GhostDetails = {
      type: 'lingering-dead',
      unusedExports: metrics.deadExports.map((e) => ({ name: e.name, line: e.line })),
    };
    ghosts.push({
      id: makeId('lingering-dead', metrics.path, metrics.deadExports[0]?.line ?? 0),
      type: 'lingering-dead',
      file: metrics.path,
      line: metrics.deadExports[0]?.line ?? 0,
      column: 0,
      title: 'The Lingering Dead',
      description: `${metrics.deadExports.length} exported symbol(s) are never imported anywhere in the project.`,
      details,
      severity,
      exorcism: exorcism(
        'The Lingering Dead',
        'Unused exports are dead code. They bloat the public API surface and mislead readers into thinking these symbols are intentional extension points.',
        `Remove or unexport the following: ${metrics.deadExports.map((e) => e.name).join(', ')}. If they are intentionally public, add a comment explaining the consumer.`,
        Math.round(0.15 * 100 * Math.min(metrics.deadExports.length / 5, 1)),
      ),
    });
  }

  // --- The Poltergeist (duplication) ---
  if (duplicateBlocks.length > 0) {
    const firstBlock = duplicateBlocks[0]!;
    const [locA] = firstBlock.locations;
    const details: GhostDetails = {
      type: 'poltergeist',
      duplicates: duplicateBlocks.map((b) => ({
        otherFile: b.locations[1].file,
        startLine: b.locations[0].startLine,
        endLine: b.locations[0].endLine,
      })),
    };
    ghosts.push({
      id: makeId('poltergeist', metrics.path, locA.startLine),
      type: 'poltergeist',
      file: metrics.path,
      line: locA.startLine,
      column: 0,
      title: 'The Poltergeist',
      description: `${duplicateBlocks.length} duplicate code block(s) found, shared with other files.`,
      details,
      severity,
      exorcism: exorcism(
        'The Poltergeist',
        'Duplicated code blocks must be maintained in multiple places simultaneously. Any change to the logic requires finding and updating every copy, making bugs more likely.',
        'Extract the shared logic into a named helper function in a shared module and replace each copy with a call to that function.',
        Math.round(0.15 * 100 * Math.min(duplicateBlocks.length / 3, 1)),
      ),
    });
  }

  // --- The Maze Keeper (deep nesting) ---
  const deepFn = metrics.functions
    .filter((f) => f.nestingDepth >= 4)
    .sort((a, b) => b.nestingDepth - a.nestingDepth)[0];
  if (deepFn) {
    const details: GhostDetails = {
      type: 'maze-keeper',
      functionName: deepFn.name,
      depth: deepFn.nestingDepth,
      line: deepFn.startLine,
    };
    ghosts.push({
      id: makeId('maze-keeper', metrics.path, deepFn.startLine),
      type: 'maze-keeper',
      file: metrics.path,
      line: deepFn.startLine,
      column: 0,
      title: 'The Maze Keeper',
      description: `Function '${deepFn.name}' has a nesting depth of ${deepFn.nestingDepth} (threshold: 4).`,
      details,
      severity,
      exorcism: exorcism(
        'The Maze Keeper',
        'Deeply nested control flow forces readers to track multiple simultaneous conditions, making the code hard to reason about and test.',
        `Flatten '${deepFn.name}' using early returns, guard clauses, or by extracting inner blocks into named helper functions.`,
        Math.round(0.20 * 100 * Math.min(deepFn.nestingDepth / 6, 1)),
      ),
    });
  }

  // --- The Ouroboros (circular dependency) ---
  if (metrics.inCircularDependency && cycle !== null) {
    const details: GhostDetails = {
      type: 'ouroboros',
      cycle,
    };
    ghosts.push({
      id: makeId('ouroboros', metrics.path, 0),
      type: 'ouroboros',
      file: metrics.path,
      line: 0,
      column: 0,
      title: 'The Ouroboros',
      description: `This file participates in a circular dependency cycle of ${cycle.length} files.`,
      details,
      severity,
      exorcism: exorcism(
        'The Ouroboros',
        'Circular imports create tight coupling and can cause subtle runtime bugs (e.g. undefined values at module initialisation time). They also prevent tree-shaking.',
        `Break the cycle by extracting the shared types or utilities into a third module that neither side imports from, then update both sides to import from the new module instead.`,
        10,
      ),
    });
  }

  // --- The Forgotten (TODO/FIXME/HACK) ---
  if (metrics.todos.length > 0) {
    const details: GhostDetails = {
      type: 'forgotten',
      comments: metrics.todos.map((t) => ({ text: t.text, line: t.line })),
    };
    ghosts.push({
      id: makeId('forgotten', metrics.path, metrics.todos[0]?.line ?? 0),
      type: 'forgotten',
      file: metrics.path,
      line: metrics.todos[0]?.line ?? 0,
      column: 0,
      title: 'The Forgotten',
      description: `${metrics.todos.length} unresolved TODO/FIXME/HACK comment(s) in this file.`,
      details,
      severity,
      exorcism: exorcism(
        'The Forgotten',
        'TODO/FIXME/HACK comments mark known deficiencies that have never been addressed. They accumulate over time and signal that parts of the code are not in their intended state.',
        'Convert each TODO into a tracked issue in your issue tracker and delete the comment, or resolve the issue in the code immediately if it is small.',
        Math.round(0.10 * 100 * Math.min(metrics.todos.length / 10, 1)),
      ),
    });
  }

  // --- The Behemoth (huge file or function) ---
  const triggers: Array<'file_size' | 'function_length'> = [];
  if (metrics.loc > 500) triggers.push('file_size');
  if (metrics.maxFunctionLength > 80) triggers.push('function_length');
  if (triggers.length > 0) {
    const details: GhostDetails = {
      type: 'behemoth',
      triggers,
      loc: metrics.loc,
      maxFunctionLength: metrics.maxFunctionLength,
    };
    ghosts.push({
      id: makeId('behemoth', metrics.path, 0),
      type: 'behemoth',
      file: metrics.path,
      line: 0,
      column: 0,
      title: 'The Behemoth',
      description: triggers.includes('file_size')
        ? `File has ${metrics.loc} lines (threshold: 500).`
        : `Longest function spans ${metrics.maxFunctionLength} lines (threshold: 80).`,
      details,
      severity,
      exorcism: exorcism(
        'The Behemoth',
        triggers.includes('file_size')
          ? 'Files over 500 lines are difficult to navigate and tend to accumulate unrelated responsibilities (violation of the Single Responsibility Principle).'
          : 'Functions longer than 80 lines are hard to read in one mental context and usually contain multiple distinct concerns.',
        triggers.includes('file_size')
          ? 'Split this file into smaller modules grouped by responsibility. Move related functions and types together into their own files.'
          : 'Decompose the long function into smaller, named helper functions, each doing one clearly nameable thing.',
        Math.round(0.10 * 100),
      ),
    });
  }

  return ghosts;
}
