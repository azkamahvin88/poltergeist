/**
 * seance.ts — Deterministic Q&A over an AnalysisResult.
 * Builds a symbol index and answers queries via regex intent matching.
 * No LLM, no network calls.
 */

import type {
  AnalysisResult,
  SeanceResponse,
  Citation,
  SymbolEntry,
  GhostType,
  FileReport,
} from './types.js';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Symbol index construction
// ---------------------------------------------------------------------------

function buildSymbolIndex(result: AnalysisResult): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];

  for (const fileReport of result.files) {
    // Functions
    for (const fn of fileReport.metrics.functions) {
      symbols.push({
        name: fn.name,
        kind: 'function',
        filePath: fileReport.path,
        line: fn.startLine,
        exported: fileReport.metrics.exports.some((e) => e.name === fn.name),
      });
    }
    // Exports (types, classes, vars not captured as functions)
    for (const exp of fileReport.metrics.exports) {
      if (!symbols.some((s) => s.name === exp.name && s.filePath === fileReport.path)) {
        symbols.push({
          name: exp.name,
          kind: 'variable',
          filePath: fileReport.path,
          line: exp.line,
          exported: true,
        });
      }
    }
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Intent patterns
// ---------------------------------------------------------------------------

const INTENTS = [
  {
    name: 'where_defined',
    pattern: /where\s+is\s+["`']?(\w+)["`']?\s+(defined|declared)/i,
  },
  {
    name: 'most_haunted',
    pattern: /most\s+haunted\s+file/i,
  },
  {
    name: 'what_depends',
    pattern: /what\s+(depends\s+on|imports)\s+["`']?([^`'"?\s]+)["`']?/i,
  },
  {
    name: 'ghosts_by_type',
    pattern: /list\s+ghosts?\s+of\s+type\s+(\S+)(?:\s+in\s+(.+))?/i,
  },
  {
    name: 'ghosts_in_module',
    pattern: /ghosts?\s+in\s+(\S+)/i,
  },
  {
    name: 'overall_score',
    pattern: /overall\s+(score|summary|haunting)/i,
  },
  {
    name: 'overall_score_alt',
    pattern: /how\s+haunted\s+(is\s+)?(this|the)\s+(repo|codebase|project)/i,
  },
] as const;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleWhereIsDefined(query: string, symbols: SymbolEntry[], fileReports: FileReport[]): SeanceResponse {
  const m = query.match(/where\s+is\s+["`']?(\w+)["`']?\s+(defined|declared)/i);
  const symbolName = m?.[1] ?? '';
  const matches = symbols.filter((s) => s.name.toLowerCase() === symbolName.toLowerCase());

  if (matches.length === 0) {
    return {
      answer: `I couldn't find a symbol named '${symbolName}' in this codebase.`,
      citations: [],
    };
  }

  const citations: Citation[] = matches.map((s) => {
    const fileReport = fileReports.find((f) => f.path === s.filePath);
    const lines = fileReport ? (/* dummy: return export line */ null) : null;
    return {
      file: s.filePath,
      line: s.line,
      snippet: `${s.kind} ${s.name} (${s.exported ? 'exported' : 'internal'})`,
    };
  });

  const first = matches[0]!;
  const exportNote = first.exported ? ' (exported)' : '';
  const answer =
    matches.length === 1
      ? `'${symbolName}' is defined as a ${first.kind}${exportNote} in ${first.filePath} at line ${first.line}.`
      : `'${symbolName}' is defined in ${matches.length} places: ${matches.map((s) => `${s.filePath}:${s.line}`).join(', ')}.`;

  return { answer, citations };
}

function handleMostHaunted(result: AnalysisResult): SeanceResponse {
  if (result.files.length === 0) {
    return { answer: 'No files were analysed.', citations: [] };
  }

  const sorted = [...result.files].sort((a, b) => b.hauntingScore - a.hauntingScore);
  const top = sorted[0]!;
  const topGhost = top.ghosts[0];

  const answer =
    `The most haunted file is ${top.path} with a score of ${top.hauntingScore}/100.` +
    (topGhost ? ` Its most prominent ghost is '${topGhost.title}'.` : '');

  return {
    answer,
    citations: [{ file: top.path, line: 1, snippet: `Haunting score: ${top.hauntingScore}` }],
  };
}

function handleWhatDepends(query: string, result: AnalysisResult): SeanceResponse {
  const m = query.match(/what\s+(depends\s+on|imports)\s+["`']?([^`'"?\s]+)["`']?/i);
  const target = m?.[2] ?? '';

  const dependents = result.importGraph
    .filter((e) => e.to.includes(target) || e.to === target)
    .map((e) => e.from);

  if (dependents.length === 0) {
    return {
      answer: `No files import '${target}' in this codebase.`,
      citations: [],
    };
  }

  const citations: Citation[] = dependents.map((f) => ({ file: f, line: 1, snippet: `imports ${target}` }));
  const answer = `${dependents.length} file(s) depend on '${target}': ${dependents.join(', ')}.`;
  return { answer, citations };
}

function handleGhostsByType(query: string, result: AnalysisResult): SeanceResponse {
  const m = query.match(/list\s+ghosts?\s+of\s+type\s+(\S+)(?:\s+in\s+(.+))?/i);
  const rawType = (m?.[1] ?? '').toLowerCase() as GhostType;
  const module = m?.[2]?.trim();

  const matching = result.ghosts.filter((g) => {
    const typeMatch = g.type === rawType || g.type.includes(rawType);
    const moduleMatch = module ? g.file.startsWith(module) : true;
    return typeMatch && moduleMatch;
  });

  if (matching.length === 0) {
    const moduleClause = module ? ` in module '${module}'` : '';
    return {
      answer: `No ghosts of type '${rawType}'${moduleClause} found.`,
      citations: [],
    };
  }

  const citations: Citation[] = matching.map((g) => ({
    file: g.file,
    line: g.line,
    snippet: g.description,
  }));

  const answer = `Found ${matching.length} ghost(s) of type '${rawType}': ${matching.map((g) => `${g.file}:${g.line}`).join(', ')}.`;
  return { answer, citations };
}

function handleGhostsInModule(query: string, result: AnalysisResult): SeanceResponse {
  const m = query.match(/ghosts?\s+in\s+(\S+)/i);
  const module = m?.[1] ?? '';

  const matching = result.ghosts.filter((g) => g.file.startsWith(module));

  if (matching.length === 0) {
    return {
      answer: `No ghosts found in module '${module}'.`,
      citations: [],
    };
  }

  const citations: Citation[] = matching.map((g) => ({
    file: g.file,
    line: g.line,
    snippet: g.description,
  }));

  const answer = `Found ${matching.length} ghost(s) in '${module}': ${matching.map((g) => `${g.title} at ${g.file}:${g.line}`).join('; ')}.`;
  return { answer, citations };
}

function handleOverallScore(result: AnalysisResult): SeanceResponse {
  const answer =
    `Overall haunting score: ${result.overallScore}/100. ` +
    `${result.files.length} file(s) analysed, ${result.totalGhosts} ghost(s) found across ${result.modules.length} module(s).`;

  return {
    answer,
    citations: [],
  };
}

// ---------------------------------------------------------------------------
// Supported question shapes (for the "I don't know" response)
// ---------------------------------------------------------------------------

const SUPPORTED_SHAPES = [
  '"where is <symbol> defined?"',
  '"what is the most haunted file?"',
  '"what depends on <file>?"',
  '"list ghosts of type <type>"',
  '"list ghosts of type <type> in <module>"',
  '"ghosts in <module>"',
  '"overall score" / "how haunted is this repo?"',
];

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

/**
 * Answer a natural-language question about the codebase.
 * Returns a SeanceResponse with an answer string and file:line citations.
 */
export function query(result: AnalysisResult, question: string): SeanceResponse {
  const q = question.trim();
  const symbols = buildSymbolIndex(result);

  if (/where\s+is\s+["`']?\w+["`']?\s+(defined|declared)/i.test(q)) {
    return handleWhereIsDefined(q, symbols, result.files);
  }
  if (/most\s+haunted\s+file/i.test(q)) {
    return handleMostHaunted(result);
  }
  if (/what\s+(depends\s+on|imports)\s+/i.test(q)) {
    return handleWhatDepends(q, result);
  }
  if (/list\s+ghosts?\s+of\s+type\s+/i.test(q)) {
    return handleGhostsByType(q, result);
  }
  if (/ghosts?\s+in\s+\S+/i.test(q)) {
    return handleGhostsInModule(q, result);
  }
  if (/overall\s+(score|summary|haunting)/i.test(q) || /how\s+haunted\s+(is\s+)?(this|the)\s+(repo|codebase|project)/i.test(q)) {
    return handleOverallScore(result);
  }

  // Fallback
  return {
    answer: `I don't know how to answer that. Here are the question shapes I understand:\n${SUPPORTED_SHAPES.map((s) => `  • ${s}`).join('\n')}`,
    citations: [],
  };
}
