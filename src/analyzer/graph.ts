/**
 * graph.ts — Import graph construction and cycle detection via Tarjan's SCC.
 * Pure functions, deterministic, no I/O.
 * Uses an iterative Tarjan implementation to avoid stack overflow on large graphs.
 *
 * Import resolution is handled by resolveRelativeImport() in parser.ts, which
 * already normalises specifier extensions (.js → .ts, etc.) at parse time.
 * buildImportGraph() therefore works with pre-normalised paths and only needs to
 * look up the resolved path directly in the known-paths set.
 */

import type { ImportEdge, FileMetrics } from './types.js';

export interface ImportGraph {
  edges: ImportEdge[];
  cycles: string[][];
  filesInCycles: Set<string>;
}

/** Build an import graph from parsed file metrics. Only relative imports are included. */
export function buildImportGraph(allMetrics: FileMetrics[]): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const knownPaths = new Set(allMetrics.map((m) => m.path));

  for (const metrics of allMetrics) {
    for (const imp of metrics.imports) {
      if (imp.resolvedPath === null) continue; // non-relative, skip

      // resolvedPath is already normalised to .ts by resolveRelativeImport().
      // If it still doesn't match a known path (e.g. the specifier pointed to a
      // .js file that genuinely exists rather than a TypeScript source), try the
      // remaining extension variants as a fallback — but this should be rare.
      let to = imp.resolvedPath;
      if (!knownPaths.has(to)) {
        const base = to.replace(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '');
        const fallbacks = [
          base + '.ts', base + '.tsx', base + '.mts',
          base + '/index.ts', base + '/index.tsx',
        ];
        to = fallbacks.find((c) => knownPaths.has(c)) ?? to;
      }

      edges.push({ from: metrics.path, to });
    }
  }

  return edges;
}

/**
 * Detect strongly connected components (SCCs) with size ≥ 2 using iterative Tarjan's algorithm.
 * Returns each SCC as an array of file paths (cycle members).
 */
export function detectCycles(edges: ImportEdge[]): string[][] {
  // Build adjacency list
  const adj = new Map<string, string[]>();
  const allNodes = new Set<string>();

  for (const { from, to } of edges) {
    allNodes.add(from);
    allNodes.add(to);
    const list = adj.get(from);
    if (list) {
      list.push(to);
    } else {
      adj.set(from, [to]);
    }
  }

  // Iterative Tarjan's SCC
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  for (const node of allNodes) {
    if (!index.has(node)) {
      tarjanVisit(node);
    }
  }

  function tarjanVisit(root: string): void {
    // Explicit stack frames to avoid recursion depth limits
    type Frame = {
      node: string;
      neighbours: string[];
      neighbourIdx: number;
    };

    const callStack: Frame[] = [];

    function pushNode(n: string): void {
      index.set(n, counter);
      lowlink.set(n, counter);
      counter++;
      stack.push(n);
      onStack.add(n);
      const neighbours = adj.get(n) ?? [];
      callStack.push({ node: n, neighbours, neighbourIdx: 0 });
    }

    pushNode(root);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]!;
      const { node, neighbours } = frame;

      if (frame.neighbourIdx < neighbours.length) {
        const w = neighbours[frame.neighbourIdx]!;
        frame.neighbourIdx++;

        if (!index.has(w)) {
          pushNode(w);
        } else if (onStack.has(w)) {
          lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(w)!));
        }
      } else {
        // All neighbours processed — pop this frame
        callStack.pop();

        if (callStack.length > 0) {
          const parentFrame = callStack[callStack.length - 1]!;
          lowlink.set(
            parentFrame.node,
            Math.min(lowlink.get(parentFrame.node)!, lowlink.get(node)!),
          );
        }

        // Check if this is an SCC root
        if (lowlink.get(node) === index.get(node)) {
          const scc: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
          } while (w !== node);
          if (scc.length >= 2) {
            sccs.push(scc);
          }
        }
      }
    }
  }

  return sccs;
}

/** Build the full import graph analysis result. */
export function analyzeGraph(allMetrics: FileMetrics[]): ImportGraph {
  const edges = buildImportGraph(allMetrics);
  const cycles = detectCycles(edges);
  const filesInCycles = new Set<string>(cycles.flat());

  return { edges, cycles, filesInCycles };
}
