/**
 * tools.ts — MCP tool definitions and handlers for Poltergeist.
 * Reuses the analyzer, seance engine, and GitHub fetch utility.
 * No HTTP server dependency.
 */

import { analyzeDirectory, analyzeFiles } from '../analyzer/analyzer.js';
import { query as seanceQuery } from '../analyzer/seance.js';
import { fetchGithubFiles, parseGithubUrl } from '../analyzer/github.js';
import type { GhostType, FileReport, Ghost } from '../analyzer/types.js';

// ---------------------------------------------------------------------------
// Tool schemas (for tools/list)
// ---------------------------------------------------------------------------

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export const TOOL_SCHEMAS: McpToolSchema[] = [
  {
    name: 'analyze_repo',
    description:
      'Analyse a local repository directory or a public GitHub repo URL. ' +
      'Returns overallScore, totalGhosts, per-module scores, and the top 10 ghosts.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Absolute path to a local repository directory.' },
        repoUrl:  { type: 'string', description: 'Public GitHub repo URL (https://github.com/owner/repo).' },
      },
    },
  },
  {
    name: 'list_ghosts',
    description: 'List all ghosts found in the last analysis of a local repo, optionally filtered by ghost type.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Absolute path to a local repository directory.' },
        type: {
          type: 'string',
          description:
            'Optional ghost type filter: lingering-dead | poltergeist | maze-keeper | ouroboros | forgotten | behemoth',
        },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'get_file_haunting',
    description: 'Get the full FileReport (score, metrics, ghosts) for a single file in a local repo.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Absolute path to a local repository directory.' },
        file:     { type: 'string', description: 'Relative file path within the repo.' },
      },
      required: ['repoPath', 'file'],
    },
  },
  {
    name: 'ask_seance',
    description:
      'Ask a deterministic natural-language question about the codebase. ' +
      'Returns an answer with file:line citations. No LLM — answers come from the analysis index.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Absolute path to a local repository directory.' },
        question: { type: 'string', description: 'Natural-language question about the codebase.' },
      },
      required: ['repoPath', 'question'],
    },
  },
];

// ---------------------------------------------------------------------------
// In-memory analysis cache: repoPath → AnalysisResult
// ---------------------------------------------------------------------------

import type { AnalysisResult } from '../analyzer/types.js';

const analysisCache = new Map<string, AnalysisResult>();

async function getOrAnalyze(repoPath: string): Promise<AnalysisResult> {
  if (analysisCache.has(repoPath)) return analysisCache.get(repoPath)!;
  const result = await analyzeDirectory(repoPath);
  analysisCache.set(repoPath, result);
  return result;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleAnalyzeRepo(
  args: { repoPath?: string; repoUrl?: string },
): Promise<unknown> {
  let result: AnalysisResult;

  if (args.repoUrl) {
    const parsed = parseGithubUrl(args.repoUrl);
    if (!parsed) throw new Error(`Invalid GitHub URL: ${args.repoUrl}`);
    const files = await fetchGithubFiles(args.repoUrl);
    result = analyzeFiles(files, `${parsed.owner}/${parsed.repo}`);
  } else if (args.repoPath) {
    result = await getOrAnalyze(args.repoPath);
  } else {
    throw new Error('Provide either repoPath or repoUrl.');
  }

  // Return compact summary
  const topGhosts = result.ghosts
    .slice()
    .sort((a, b) => {
      // Sort by file score descending
      const aScore = result.files.find((f) => f.path === a.file)?.hauntingScore ?? 0;
      const bScore = result.files.find((f) => f.path === b.file)?.hauntingScore ?? 0;
      return bScore - aScore;
    })
    .slice(0, 10)
    .map((g) => ({
      type: g.type,
      file: g.file,
      line: g.line,
      title: g.title,
      description: g.description,
    }));

  return {
    repoName: result.repoName,
    analysedAt: result.analyzedAt,
    overallScore: result.overallScore,
    totalGhosts: result.totalGhosts,
    fileCount: result.files.length,
    cycleCount: result.cycles.length,
    modules: result.modules.map((m) => ({
      name: m.name,
      hauntingScore: m.hauntingScore,
      ghostCount: m.ghostCount,
    })),
    topGhosts,
  };
}

export async function handleListGhosts(
  args: { repoPath: string; type?: string },
): Promise<unknown> {
  const result = await getOrAnalyze(args.repoPath);
  const ghosts: Ghost[] = args.type
    ? result.ghosts.filter((g) => g.type === (args.type as GhostType))
    : result.ghosts;

  return {
    total: ghosts.length,
    ghosts: ghosts.map((g) => ({
      id: g.id,
      type: g.type,
      title: g.title,
      file: g.file,
      line: g.line,
      severity: g.severity,
      description: g.description,
    })),
  };
}

export async function handleGetFileHaunting(
  args: { repoPath: string; file: string },
): Promise<unknown> {
  const result = await getOrAnalyze(args.repoPath);
  const fileReport: FileReport | undefined = result.files.find((f) => f.path === args.file);

  if (!fileReport) {
    throw new Error(
      `File '${args.file}' not found in analysis. ` +
      `Available files: ${result.files.map((f) => f.path).join(', ')}`,
    );
  }

  return fileReport;
}

export async function handleAskSeance(
  args: { repoPath: string; question: string },
): Promise<unknown> {
  const result = await getOrAnalyze(args.repoPath);
  return seanceQuery(result, args.question);
}
