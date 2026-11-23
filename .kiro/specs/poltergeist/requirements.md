# Poltergeist — Requirements

## 1. Input Sources

**Req 1.1 — GitHub URL input**
WHEN a user submits a valid public GitHub repository URL,
THEN the system SHALL fetch the default-branch tarball via `https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD` without requiring any authentication token,
AND unpack and analyse the contents in memory.

**Req 1.2 — GitHub rate-limit fallback**
IF the GitHub tarball request returns HTTP 429 or any 5xx status,
THEN the system SHALL return an HTTP 503 response with a JSON body `{ "error": "github_unavailable", "fallback": "demo" }` and SHALL NOT crash.

**Req 1.3 — Folder upload**
WHEN a user selects a local folder via the `<input webkitdirectory>` file picker,
THEN the browser SHALL collect all `.js`, `.ts`, `.jsx`, `.tsx` files, encode them as a JSON array of `{ path: string, content: string }` objects, and POST them to `/api/analyze`.

**Req 1.4 — Upload size limit**
IF the uploaded JSON payload exceeds 50 MB,
THEN the server SHALL respond with HTTP 413 and `{ "error": "payload_too_large" }` before attempting analysis.

**Req 1.5 — Demo repo (dogfood)**
WHEN a user clicks the "Analyse Demo Repo" button,
THEN the frontend SHALL call `GET /api/demo`,
AND the server SHALL run the analyser against its own source tree (the files in `src/`) and return a full `AnalysisResult`.

**Req 1.6 — File type filtering**
WHEN analysing any source, the system SHALL process only files with extensions `.js`, `.ts`, `.jsx`, `.tsx` and SHALL silently skip all other file types.

---

## 2. Per-File Metrics

**Req 2.1 — Lines of code**
WHEN a file is analysed,
THEN the system SHALL report `loc` as the count of non-blank, non-comment lines.

**Req 2.2 — Function count**
WHEN a file is analysed,
THEN the system SHALL count all function declarations, arrow functions assigned to variables, and class methods, and report them as `functionCount`.

**Req 2.3 — Maximum function length**
WHEN a file is analysed,
THEN the system SHALL report `maxFunctionLength` as the LOC of the longest single function body in that file.

**Req 2.4 — Maximum nesting depth**
WHEN a file is analysed,
THEN the system SHALL traverse the AST and report `maxNestingDepth` as the maximum number of nested control-flow blocks (`if`, `for`, `while`, `switch`, `try`, `catch`) within any function.

**Req 2.5 — Cyclomatic complexity approximation**
WHEN a file is analysed,
THEN the system SHALL approximate cyclomatic complexity per function as `1 + (number of branch points: if, else if, ternary, &&, ||, ??, case, catch, for, while, do)` and report `maxCyclomaticComplexity` as the highest value in the file.

**Req 2.6 — TODO/FIXME/HACK comments**
WHEN a file is analysed,
THEN the system SHALL report `todoCount` as the number of single-line or block comments containing the tokens `TODO`, `FIXME`, or `HACK` (case-insensitive).

**Req 2.7 — Dead exports**
WHEN a file is analysed as part of a multi-file project,
THEN the system SHALL mark an export as dead if no other file in the project imports it,
AND SHALL report `deadExportCount`.

**Req 2.8 — Duplicate blocks**
WHEN a file is analysed as part of a multi-file project,
THEN the system SHALL detect near-duplicate code blocks using normalised-line hashing (strip leading/trailing whitespace, collapse internal whitespace, ignore blank lines) over a sliding window of ≥ 6 consecutive statements,
AND SHALL report `duplicateBlockCount` for each file.

**Req 2.9 — Circular dependency detection**
WHEN a project is analysed,
THEN the system SHALL build a directed import graph and detect all strongly-connected components (SCCs) of size ≥ 2 using depth-first search (Tarjan's or Kosaraju's algorithm),
AND EACH file participating in a cycle SHALL have `inCircularDependency: true`.

**Req 2.10 — Huge file / huge function detection**
WHEN a file is analysed,
THEN the system SHALL flag `isHugeFile: true` if `loc > 500`,
AND SHALL flag `hasHugeFunction: true` if `maxFunctionLength > 80`.

---

## 3. Haunting Score

**Req 3.1 — Per-file score**
WHEN per-file metrics are computed,
THEN the system SHALL calculate a `hauntingScore` integer in [0, 100] using a weighted formula (see Design doc § Scoring Formula).

**Req 3.2 — Score bounds**
The `hauntingScore` SHALL always satisfy `0 ≤ hauntingScore ≤ 100`.

**Req 3.3 — Score monotonicity**
IF any metric is increased while all others are held constant,
THEN the resulting `hauntingScore` SHALL NOT decrease.

**Req 3.4 — Module rollup score**
WHEN a module (directory) contains multiple files,
THEN the system SHALL compute a `moduleHauntingScore` as the LOC-weighted mean of its files' scores, clamped to [0, 100].

---

## 4. Ghost Taxonomy

Each ghost type maps to one or more per-file metrics. A file MAY have multiple ghosts.

**Req 4.1 — The Lingering Dead (dead code)**
WHEN `deadExportCount > 0`,
THEN the file SHALL have a ghost of type `LINGERING_DEAD` listing the unused export names and their declaration line numbers.

**Req 4.2 — The Poltergeist (duplication)**
WHEN `duplicateBlockCount > 0`,
THEN the file SHALL have a ghost of type `POLTERGEIST` listing the duplicate block locations (file, start line, end line) for each pair.

**Req 4.3 — The Maze Keeper (deep nesting)**
WHEN `maxNestingDepth ≥ 4`,
THEN the file SHALL have a ghost of type `MAZE_KEEPER` with the offending function name and nesting depth.

**Req 4.4 — The Ouroboros (circular dependency)**
WHEN `inCircularDependency === true`,
THEN the file SHALL have a ghost of type `OUROBOROS` listing the cycle path (array of file paths forming the cycle).

**Req 4.5 — The Forgotten (TODO/FIXME/HACK)**
WHEN `todoCount > 0`,
THEN the file SHALL have a ghost of type `FORGOTTEN` listing each comment's text and line number.

**Req 4.6 — The Behemoth (huge file or function)**
WHEN `isHugeFile === true` OR `hasHugeFunction === true`,
THEN the file SHALL have a ghost of type `BEHEMOTH` with the specific trigger (`file_size`, `function_length`, or both) and the offending metric values.

---

## 5. Exorcism Reports

**Req 5.1 — Report content**
WHEN a user clicks a ghost in the UI or calls `get_file_haunting` via MCP,
THEN the system SHALL return an exorcism report containing:
- Ghost type and display name
- Affected file path and line numbers
- Human-readable explanation of why this is a code smell
- Concrete fix suggestion (at least one actionable step)
- Estimated haunting-score reduction if the smell is resolved

**Req 5.2 — Determinism**
Exorcism reports SHALL be generated purely from the analysis data with no external API calls.

---

## 6. Séance Q&A

**Req 6.1 — Intent: symbol definition lookup**
WHEN a user asks "where is `<symbol>` defined?" (or equivalent phrasing),
THEN the system SHALL search the symbol index and return the file path, line number, and declaration kind (function/class/variable/type).

**Req 6.2 — Intent: most haunted file**
WHEN a user asks "what is the most haunted file?" (or equivalent),
THEN the system SHALL return the file with the highest `hauntingScore`, its score, and its top ghost type.

**Req 6.3 — Intent: dependency query**
WHEN a user asks "what depends on `<file>`?" (or equivalent),
THEN the system SHALL return the list of files in the import graph that have a direct import edge pointing to that file.

**Req 6.4 — Intent: ghost listing by type/module**
WHEN a user asks "list ghosts of type `<T>` in module `<M>`" (or equivalent),
THEN the system SHALL return all Ghost records matching that type within the specified module path prefix, with file:line citations.

**Req 6.5 — Unrecognised intent**
IF the system cannot match the query to a known intent,
THEN it SHALL return `{ "answer": "I couldn't find that in the codebase.", "citations": [] }`.

**Req 6.6 — Citations**
EVERY séance response SHALL include a `citations` array of `{ file: string, line: number, snippet: string }` objects referencing the actual analysis data used to form the answer.

**Req 6.7 — Offline operation**
The séance engine SHALL operate without any network access or external LLM API calls.

---

## 7. API Endpoints

**Req 7.1 — POST /api/analyze**
- Request: `Content-Type: application/json`, body: `{ "url"?: string, "files"?: FileEntry[] }`
- Exactly one of `url` or `files` MUST be present; if neither or both are present, respond HTTP 400.
- Response 200: `AnalysisResult` JSON.
- Response 413: payload too large.
- Response 503: GitHub unavailable (with fallback hint).

**Req 7.2 — GET /api/demo**
- No request body.
- Response 200: `AnalysisResult` JSON for the server's own `src/` directory.

**Req 7.3 — POST /api/seance**
- Request: `Content-Type: application/json`, body: `{ "query": string, "sessionId": string }`
- The `sessionId` references a prior `AnalysisResult` stored server-side (keyed by session).
- Response 200: `SeanceResponse` JSON (`{ answer: string, citations: Citation[] }`).
- Response 404: session not found.
- Response 400: missing `query` or `sessionId`.

**Req 7.4 — Static assets**
WHEN a `GET` request arrives for any path not matching `/api/*`,
THEN the server SHALL serve files from the `public/` directory, defaulting to `index.html`.

---

## 8. MCP Server

**Req 8.1 — Transport**
The MCP server SHALL communicate over stdio using the JSON-RPC 2.0 framing expected by the MCP protocol.

**Req 8.2 — Tool: analyze_repo**
Input: `{ "url": string }` or `{ "files": FileEntry[] }`
Output: full `AnalysisResult` JSON.

**Req 8.3 — Tool: list_ghosts**
Input: `{ "sessionId": string, "type"?: GhostType, "module"?: string }`
Output: `{ ghosts: Ghost[] }`.

**Req 8.4 — Tool: get_file_haunting**
Input: `{ "sessionId": string, "filePath": string }`
Output: `FileReport` with embedded exorcism reports.

**Req 8.5 — Tool: ask_seance**
Input: `{ "sessionId": string, "query": string }`
Output: `SeanceResponse`.

**Req 8.6 — MCP registration**
The MCP server SHALL be registered in `.kiro/settings/mcp.json` under the key `"poltergeist"` with `"command": "node"` and the compiled entry point as the argument.

---

## 9. Frontend

**Req 9.1 — Haunted house SVG floor plan**
WHEN an `AnalysisResult` is available,
THEN the frontend SHALL render a room-and-furniture SVG layout where:
- Each directory (module) is a room, sized proportionally to its total LOC.
- Each file within a room is a furniture element, sized by LOC.
- Room fill colour encodes `moduleHauntingScore` (green → amber → red scale).

**Req 9.2 — Ghost overlay**
WHEN a file has ghosts,
THEN ghost icons SHALL be overlaid on the corresponding furniture element, one icon per ghost type present.

**Req 9.3 — Haunting meter**
WHEN an `AnalysisResult` is available,
THEN a global haunting meter (0–100) SHALL be displayed, computed as the LOC-weighted mean of all file scores.

**Req 9.4 — Ghost detail panel**
WHEN a user clicks a ghost icon,
THEN a detail panel SHALL appear showing the exorcism report for that ghost (type, explanation, fix suggestion, score impact).

**Req 9.5 — Séance UI**
WHEN an `AnalysisResult` is available,
THEN a séance chat interface SHALL be available where the user can type free-text queries and receive answers with file:line citation links.

**Req 9.6 — Citation links**
WHEN a séance response includes citations,
THEN each citation SHALL be a clickable link that scrolls the floor-plan view to the referenced file and highlights it.

**Req 9.7 — No framework**
The frontend SHALL be implemented in vanilla JavaScript (ES2022+) with no frontend build step, no npm packages, and no framework. A single `index.html` loads inline or same-origin scripts.

---

## 10. Testing

**Req 10.1 — Unit tests**
The project SHALL have unit tests for the analyser modules (metrics extraction, scoring, graph algorithms, séance matching) using the Node built-in `node:test` runner.

**Req 10.2 — Property-based tests (PBT)**
Using `fast-check`, the project SHALL have PBT tests verifying:
- Score bounds: `∀ metrics → 0 ≤ score ≤ 100`
- Score monotonicity: `∀ metrics m, ∀ k in metrics: metrics[k]++ → score(m') ≥ score(m)`
- Module rollup in [0, 100] for any set of file scores and LOC values.

**Req 10.3 — Test isolation**
Tests SHALL NOT make real network requests and SHALL NOT read the filesystem except for fixture files under `test/fixtures/`.

---

## 11. Constraints

**Req 11.1 — No external API key**
The system SHALL function without any third-party API key (OpenAI, GitHub auth, etc.).

**Req 11.2 — Parse only**
The analyser SHALL use the TypeScript compiler API to parse source files into an AST and extract information. It SHALL NEVER execute (`eval`, dynamic `import`, `require`) user-supplied code.

**Req 11.3 — No heavy framework on server**
The HTTP server SHALL be built on Node's built-in `http` module. No Express, Fastify, Koa, or similar.

**Req 11.4 — Offline séance**
The séance engine SHALL produce answers from the in-memory analysis index with no network calls.

**Req 11.5 — Tarball extraction safety**
WHEN extracting a GitHub tarball,
THEN the system SHALL reject any entry whose resolved path would escape the extraction sandbox (zip-slip prevention).
