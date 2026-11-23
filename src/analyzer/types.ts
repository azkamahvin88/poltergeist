// Shared data model for Poltergeist — all types in one place (no cross-src imports here)

export type GhostType =
  | 'lingering-dead'
  | 'poltergeist'
  | 'maze-keeper'
  | 'ouroboros'
  | 'forgotten'
  | 'behemoth';

export type Severity = 'calm' | 'eerie' | 'haunted' | 'cursed';

// Details are discriminated by ghost type
export type GhostDetails =
  | { type: 'lingering-dead'; unusedExports: Array<{ name: string; line: number }> }
  | { type: 'poltergeist'; duplicates: Array<{ otherFile: string; startLine: number; endLine: number }> }
  | { type: 'maze-keeper'; functionName: string; depth: number; line: number }
  | { type: 'ouroboros'; cycle: string[] }
  | { type: 'forgotten'; comments: Array<{ text: string; line: number }> }
  | { type: 'behemoth'; triggers: Array<'file_size' | 'function_length'>; loc: number; maxFunctionLength: number };

export interface ExorcismReport {
  displayName: string;
  explanation: string;
  fixSuggestion: string;
  estimatedScoreReduction: number;
}

export interface Ghost {
  id: string;
  type: GhostType;
  file: string;
  line: number;
  column: number;
  title: string;
  description: string;
  exorcism: ExorcismReport;
  severity: Severity;
  details: GhostDetails;
}

export interface FunctionInfo {
  name: string;
  startLine: number;
  lengthLines: number;
  nestingDepth: number;
  cyclomaticComplexity: number;
}

export interface TodoComment {
  text: string;
  line: number;
  kind: 'TODO' | 'FIXME' | 'HACK';
}

export interface ImportInfo {
  specifier: string;
  resolvedPath: string | null; // null if not a relative import
}

export interface ExportInfo {
  name: string;
  line: number;
}

export interface FileMetrics {
  path: string;
  loc: number;        // non-blank, non-comment lines
  sloc: number;       // alias for loc (source lines of code)
  functions: FunctionInfo[];
  maxFunctionLength: number;
  maxNestingDepth: number;
  cyclomaticComplexity: number; // max over all functions
  todos: TodoComment[];
  exports: ExportInfo[];
  deadExports: ExportInfo[];
  duplicateBlocks: number;
  imports: ImportInfo[];
  inCircularDependency: boolean;
  parseError?: string;
}

export interface FileReport {
  path: string;
  metrics: FileMetrics;
  ghosts: Ghost[];
  hauntingScore: number;
}

export interface ModuleRollup {
  name: string;         // top-level directory name, or "root"
  files: string[];      // file paths
  hauntingScore: number;
  ghostCount: number;
  topGhosts: GhostType[];
}

export interface ImportEdge {
  from: string;
  to: string;
}

export interface AnalysisResult {
  repoName: string;
  analyzedAt: string;      // ISO 8601
  sessionId: string;       // UUID v4
  files: FileReport[];
  modules: ModuleRollup[];
  totalGhosts: number;
  overallScore: number;    // LOC-weighted mean of file scores
  ghosts: Ghost[];         // flat list across all files
  importGraph: ImportEdge[];
  cycles: string[][];
  skippedFiles?: string[]; // files skipped due to caps
}

// Séance types
export interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum';
  filePath: string;
  line: number;
  exported: boolean;
}

export interface Citation {
  file: string;
  line: number;
  snippet: string;
}

export interface SeanceResponse {
  answer: string;
  citations: Citation[];
}

// File entry for input
export interface FileEntry {
  path: string;
  content: string;
}
