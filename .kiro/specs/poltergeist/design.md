# Poltergeist — Design

## 1. Module Map

```
poltergeist/
├── src/
│   ├── analyzer/
│   │   ├── parser.ts          # TypeScript compiler API: parse files to AST
│   │   ├── metrics.ts         # Extract per-file metrics from AST
│   │   ├── scoring.ts         # Haunting score formula
│   │   ├── graph.ts           # Import graph construction + cycle detection
│   │   ├── duplicates.ts      # Normalised-line hash duplicate detection
│   │   └── index.ts           # Orchestrates full analysis pipeline
│   ├── server/
│   │   ├── http-server.ts     # Node http.createServer — routes dispatcher
│   │   ├── routes.ts          # Route handlers: /api/analyze, /api/demo, /api/seance
│   │   ├── session-store.ts   # In-memory map: sessionId → AnalysisResult
│   │   ├── fetcher.ts         # GitHub tarball fetch + zip-slip-safe extraction
│   │   └── logger.ts          # Tiny structured logger (no console.log elsewhere)
│   ├── mcp-server/
│   │   ├── server.ts          # Stdio MCP server entry point
│   │   └── tools.ts           # MCP tool handlers (analyze_repo, list_ghosts, …)
│   └── seance/
│       ├── index-builder.ts   # Build SeanceIndex from AnalysisResult
│       └── query-engine.ts    # Intent matching + answer generation
├── public/
│   ├── index.html             # SPA shell
│   ├── app.js                 # Main app logic (vanilla JS)
│   ├── floor-plan.js          # SVG haunted house renderer
│   ├── seance-ui.js           # Séance chat widget
│   └── styles.css             # Halloween theme
└── test/
    ├── analyzer/              # Unit tests for each analyzer module
    ├── server/                # Route handler tests (using http.request against test server)
    ├── seance/                # Séance engine tests
    ├── pbt/                   # fast-check property-based tests
    └── fixtures/              # Static .ts/.js files used as test input
```

---

## 2. Data Model

All types live in `src/types.ts` (shared across analyzer, server, MCP server, seance).

```typescript
// A single entry from a folder upload or tarball extraction
interface FileEntry {
  path: string;      // relative path within the project
  content: string;   // UTF-8 source text
}

// Raw metrics extracted by the analyser for one file
interface FileMetrics {
  path: string;
  loc: number;                    // non-blank, non-comment lines
  functionCount: number;
  maxFunctionLength: number;      // LOC of longest function body
  maxNestingDepth: number;        // deepest control-flow nesting in any function
  maxCyclomaticComplexity: number;
  todoCount: number;
  deadExportCount: number;
  duplicateBlockCount: number;
  inCircularDependency: boolean;
  isHugeFile: boolean;            // loc > 500
  hasHugeFunction: boolean;       // maxFunctionLength > 80
}

// A single code smell instance attached to a file
interface Ghost {
  id: string;                     // deterministic: `${type}:${filePath}:${line}`
  type: GhostType;
  filePath: string;
  line: number;                   // primary affected line (first occurrence)
  details: GhostDetails;          // type-discriminated union (see below)
  exorcism: ExorcismReport;
}

type GhostType =
  | 'LINGERING_DEAD'
  | 'POLTERGEIST'
  | 'MAZE_KEEPER'
  | 'OUROBOROS'
  | 'FORGOTTEN'
  | 'BEHEMOTH';

// Discriminated detail payloads
type GhostDetails =
  | { type: 'LINGERING_DEAD'; unusedExports: Array<{ name: string; line: number }> }
  | { type: 'POLTERGEIST'; duplicates: Array<{ otherFile: string; startLine: number; endLine: number }> }
  | { type: 'MAZE_KEEPER'; functionName: string; depth: number; line: number }
  | { type: 'OUROBOROS'; cycle: string[] }
  | { type: 'FORGOTTEN'; comments: Array<{ text: string; line: number }> }
  | { type: 'BEHEMOTH'; triggers: Array<'file_size' | 'function_length'>; loc: number; maxFunctionLength: number };

interface ExorcismReport {
  displayName: string;
  explanation: string;
  fixSuggestion: string;
  estimatedScoreReduction: number;  // points removed if smell fully resolved
}

// Per-file report (metrics + score + ghosts)
interface FileReport {
  metrics: FileMetrics;
  hauntingScore: number;    // 0–100
  ghosts: Ghost[];
}

// Rollup for a directory
interface ModuleRollup {
  modulePath: string;
  moduleHauntingScore: number;  // LOC-weighted mean, clamped [0,100]
  totalLoc: number;
  fileCount: number;
  ghostCount: number;
  topGhostType: GhostType | null;
}

// Full result of one analysis run
interface AnalysisResult {
  sessionId: string;         // UUID, used for /api/seance and MCP session
  analysedAt: string;        // ISO 8601 timestamp
  projectName: string;       // derived from URL hostname/repo path or folder name
  files: FileReport[];
  modules: ModuleRollup[];
  globalHauntingScore: number;  // LOC-weighted mean of all files
  importGraph: ImportEdge[];
  cycles: string[][];           // each inner array is a cycle path
}

interface ImportEdge {
  from: string;
  to: string;
}

// Séance
interface SeanceIndex {
  sessionId: string;
  symbols: SymbolEntry[];        // all exported/top-level symbols
  fileScores: Array<{ path: string; score: number; topGhost: GhostType | null }>;
  importGraph: ImportEdge[];
  cycles: string[][];
  ghosts: Ghost[];
}

interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum';
  filePath: string;
  line: number;
  exported: boolean;
}

interface Citation {
  file: string;
  line: number;
  snippet: string;
}

interface SeanceResponse {
  answer: string;
  citations: Citation[];
}
```

---

## 3. Scoring Formula

### 3.1 Raw component scores

Each metric is normalised to a [0, 1] contribution using a **soft cap** function:
`norm(x, threshold) = min(x / threshold, 1)`

| Metric | Threshold | Weight |
|--------|-----------|--------|
| `maxNestingDepth` | 6 | 0.20 |
| `maxCyclomaticComplexity` | 20 | 0.20 |
| `deadExportCount` | 5 | 0.15 |
| `duplicateBlockCount` | 3 | 0.15 |
| `todoCount` | 10 | 0.10 |
| `inCircularDependency` | 1 (bool) | 0.10 |
| `isHugeFile` | 1 (bool) | 0.05 |
| `hasHugeFunction` | 1 (bool) | 0.05 |

### 3.2 Final score

```
rawScore = Σ (norm(metric_i, threshold_i) × weight_i)
hauntingScore = Math.round(Math.min(Math.max(rawScore × 100, 0), 100))
```

Weights sum to 1.00, so `rawScore ∈ [0, 1]` before clamping.

### 3.3 Module rollup

```
moduleHauntingScore = round(
  Σ(file.hauntingScore × file.loc) / Σ(file.loc)
)
```

If a module has zero total LOC (all empty files), the score defaults to 0. Result is clamped to [0, 100].

### 3.4 Global score

Same LOC-weighted mean formula across all files in the project.

---

## 4. Duplicate Detection Algorithm

Implemented in `src/analyzer/duplicates.ts`.

1. For each file, split source into logical lines (after TypeScript parsing: use statement boundaries from the AST rather than raw newlines when feasible; fall back to raw lines).
2. **Normalise** each line: trim whitespace, collapse runs of spaces/tabs to a single space, remove blank lines.
3. Build a **sliding window** of 6 consecutive normalised lines, joined with `\n`.
4. Hash each window with a fast hash (FNV-1a 32-bit or similar, implemented in TypeScript without native add-ons).
5. Store hashes in a global `Map<hash, Array<{ file, startLine, endLine }>>`.
6. After processing all files, any hash bucket with ≥ 2 entries represents a duplicate block. Report pairs within that bucket as `POLTERGEIST` ghost instances.
7. Deduplication: if windows overlap (i.e., start lines differ by ≤ 3 for the same file pair), merge them into a single reported duplicate block.

---

## 5. Cycle Detection Algorithm

Implemented in `src/analyzer/graph.ts`.

1. **Build import graph**: parse `import` declarations and `require()` calls from each file's AST. Resolve relative paths to canonical project-relative paths. Ignore node_modules imports.
2. **Tarjan's SCC algorithm** (iterative to avoid stack overflow on large projects):
   - Maintain `index`, `lowlink`, `onStack`, and `stack` state per node.
   - Each SCC with ≥ 2 nodes is a cycle.
3. Report each SCC as a `cycle` path (nodes in discovery order).
4. Mark every file in a cycle with `inCircularDependency: true`.
5. Store all `ImportEdge` objects and `cycles` on the `AnalysisResult`.

---

## 6. Séance Retrieval Algorithm

Implemented in `src/seance/query-engine.ts`.

### 6.1 Index construction (index-builder.ts)

After analysis, build a `SeanceIndex`:
- Walk all `FileReport` entries, extract top-level and exported symbols via AST visitor → populate `symbols[]`.
- Copy `fileScores`, `importGraph`, `cycles`, `ghosts` directly from `AnalysisResult`.

### 6.2 Intent matching

Queries are matched against a small set of patterns using regular expressions (no ML, no external LLM):

| Pattern | Intent | Handler |
|---------|--------|---------|
| `/where\s+is\s+["`']?(\w+)["`']?\s+(defined|declared)/i` | Symbol definition | Lookup `symbols` by name |
| `/most\s+haunted\s+file/i` | Top haunted file | Sort `fileScores` desc, return first |
| `/what\s+depends\s+on\s+["`']?([^`'"?]+)["`']?/i` | Reverse dependencies | Filter `importGraph` where `to` matches |
| `/list\s+ghosts?\s+of\s+type\s+(\w+)(\s+in\s+(.+))?/i` | Ghost listing | Filter `ghosts` by type ± module prefix |
| `/ghosts?\s+in\s+(.+)/i` | Ghost listing by module | Filter `ghosts` by module prefix |

### 6.3 Answer generation

Each handler builds a plain-English `answer` string and populates `citations` with `{ file, line, snippet }` referencing the actual source lines from the analysis input.

### 6.4 Fallback

If no pattern matches, return the "not found" response (Req 6.5).

---

## 7. API Contracts

### POST /api/analyze

**Request**
```json
{
  "url": "https://github.com/owner/repo",
  "files": null
}
```
or
```json
{
  "url": null,
  "files": [
    { "path": "src/index.ts", "content": "export const x = 1;" }
  ]
}
```

**Response 200**
```json
{
  "sessionId": "uuid-v4",
  "analysedAt": "2026-11-23T10:00:00Z",
  "projectName": "owner/repo",
  "files": [ /* FileReport[] */ ],
  "modules": [ /* ModuleRollup[] */ ],
  "globalHauntingScore": 42,
  "importGraph": [ { "from": "src/a.ts", "to": "src/b.ts" } ],
  "cycles": [ ["src/a.ts", "src/b.ts"] ]
}
```

**Response 400**
```json
{ "error": "bad_request", "message": "Provide exactly one of 'url' or 'files'." }
```

**Response 413**
```json
{ "error": "payload_too_large", "maxBytes": 52428800 }
```

**Response 503**
```json
{ "error": "github_unavailable", "fallback": "demo" }
```

### GET /api/demo

**Response 200** — same shape as POST /api/analyze 200.

### POST /api/seance

**Request**
```json
{ "sessionId": "uuid-v4", "query": "where is parseFile defined?" }
```

**Response 200**
```json
{
  "answer": "parseFile is defined in src/analyzer/parser.ts at line 12.",
  "citations": [
    { "file": "src/analyzer/parser.ts", "line": 12, "snippet": "export function parseFile(entry: FileEntry): SourceFile {" }
  ]
}
```

**Response 400**
```json
{ "error": "bad_request", "message": "Missing 'query' or 'sessionId'." }
```

**Response 404**
```json
{ "error": "session_not_found" }
```

---

## 8. Error Handling

- All route handlers are wrapped in `try/catch`. Uncaught errors yield HTTP 500 with `{ "error": "internal_error", "message": string }`.
- The analyser propagates parse errors as `FileReport` entries with `hauntingScore: 0` and an error note in a special ghost of type `BEHEMOTH` with trigger `parse_error` (not counted toward normal scoring).
- The MCP server surfaces tool errors as JSON-RPC error responses with appropriate error codes.
- Server startup failures (port in use, etc.) are logged at `ERROR` level and exit with code 1.

---

## 9. Security Notes

### 9.1 No code execution
The analyser uses the TypeScript compiler API's `createSourceFile` (parse mode only). It NEVER:
- Calls `eval()` on user-supplied source.
- Uses dynamic `import()` or `require()` to load user-supplied files.
- Executes any child process for analysis.

### 9.2 Zip-slip prevention
When extracting GitHub tarballs, every entry path is resolved against the sandbox directory. If `path.resolve(sandbox, entry)` does not start with `sandbox + path.sep`, the entry is rejected and extraction aborts with an error.

### 9.3 Upload size limit
The server enforces a 50 MB hard limit by accumulating the raw request body length before JSON parsing.

### 9.4 Session isolation
Each `sessionId` is a UUID v4 generated server-side. Session data is stored in a plain in-memory `Map`. No session ID from user input can reference another user's session without guessing the UUID.

### 9.5 Path traversal in séance queries
File path arguments in séance queries and MCP tool inputs are validated to be relative paths within the project (no `..` segments, no absolute paths) before being used as map keys.
