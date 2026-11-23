# Poltergeist — Implementation Tasks

Tasks are ordered for sequential delivery. Each milestone builds on the previous one.
Requirement references use the format "Req N.M" matching `requirements.md`.

---

## Milestone 1 — Spec, Steering, .gitignore ✅

- [x] **T1.1** Write `.kiro/specs/poltergeist/requirements.md` — full EARS-style requirements (Req 1–11)
- [x] **T1.2** Write `.kiro/specs/poltergeist/design.md` — architecture, data model, algorithms, API contracts, security notes
- [x] **T1.3** Write `.kiro/specs/poltergeist/tasks.md` — this file
- [x] **T1.4** Write `.kiro/steering/product.md` — product overview and tone guide
- [x] **T1.5** Write `.kiro/steering/tech.md` — stack, commands, constraints
- [x] **T1.6** Write `.kiro/steering/structure.md` — repo layout and conventions
- [x] **T1.7** Create `.gitignore` — ignore build artefacts, keep `.kiro/`

---

## Milestone 2 — Core Analyser, API Server, Unit Tests

### 2a — Project scaffolding

- [ ] **T2.1** Create `package.json` with `name: "poltergeist"`, `type: "module"`, scripts (`build`, `dev`, `test`, `start`), and dev dependencies: `typescript`, `@types/node`, `fast-check` (Req 10.2, Tech steering)
- [ ] **T2.2** Create `tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `outDir: "dist"`, `rootDir: "src"` (Tech steering)
- [ ] **T2.3** Create `src/types.ts` — all shared TypeScript interfaces: `FileEntry`, `FileMetrics`, `Ghost`, `GhostType`, `GhostDetails`, `ExorcismReport`, `FileReport`, `ModuleRollup`, `AnalysisResult`, `ImportEdge`, `SeanceIndex`, `SymbolEntry`, `Citation`, `SeanceResponse` (Design § 2)

### 2b — Analyser modules

- [ ] **T2.4** Implement `src/analyzer/parser.ts` — wrap `typescript.createSourceFile` to parse a `FileEntry` into a `ts.SourceFile`; expose `parseFile(entry: FileEntry): ts.SourceFile` (Req 11.2)
- [ ] **T2.5** Implement `src/analyzer/metrics.ts` — AST visitor that extracts all `FileMetrics` fields from a `ts.SourceFile` (Req 2.1–2.10)
- [ ] **T2.6** Implement `src/analyzer/scoring.ts` — `computeScore(metrics: FileMetrics): number` using the weighted formula (Req 3.1–3.3, Design § 3)
- [ ] **T2.7** Implement `src/analyzer/graph.ts` — `buildImportGraph(files: FileEntry[]): ImportEdge[]` and `detectCycles(graph: ImportEdge[]): string[][]` using Tarjan's SCC algorithm (Req 2.9, Design § 5)
- [ ] **T2.8** Implement `src/analyzer/duplicates.ts` — `detectDuplicates(files: FileEntry[]): Map<string, DuplicateBlock[]>` using normalised-line hashing (Req 2.8, Design § 4)
- [ ] **T2.9** Implement `src/analyzer/index.ts` — `analyse(files: FileEntry[], projectName: string): AnalysisResult` orchestration: parse → metrics → graph → duplicates → dead exports → scoring → ghost generation → module rollup → global score (Req 2.1–4.6)
- [ ] **T2.10** Implement exorcism report generation inside the ghost-creation step of `index.ts` — per ghost type, produce `ExorcismReport` (explanation, fix suggestion, estimated score reduction) (Req 5.1–5.2)

### 2c — HTTP server

- [ ] **T2.11** Implement `src/server/logger.ts` — tiny structured logger with levels DEBUG/INFO/WARN/ERROR writing to stderr as JSON lines (Structure steering)
- [ ] **T2.12** Implement `src/server/session-store.ts` — `SessionStore` class wrapping `Map<string, AnalysisResult>` with `set`, `get`, `has` methods (Req 7.3, Design § 9.4)
- [ ] **T2.13** Implement `src/server/fetcher.ts` — `fetchGithubTarball(url: string): Promise<FileEntry[]>` using Node `https` module; zip-slip-safe extraction using `zlib` and `tar` parsing (Req 1.1, 1.2, 11.5)
- [ ] **T2.14** Implement `src/server/routes.ts` — handlers for `POST /api/analyze`, `GET /api/demo`, `POST /api/seance`; enforce size limit (Req 7.1–7.4, Design § 7)
- [ ] **T2.15** Implement `src/server/http-server.ts` — `createServer()` wiring routes + static file serving from `public/`; export `start(port: number): void` (Req 7.4, Req 11.3)
- [ ] **T2.16** Create `src/server/main.ts` — entry point: reads `PORT` env var (default 3000), calls `start(port)`, logs startup message (Structure steering)

### 2d — Séance engine

- [ ] **T2.17** Implement `src/seance/index-builder.ts` — `buildSeanceIndex(result: AnalysisResult): SeanceIndex` (Design § 6.1)
- [ ] **T2.18** Implement `src/seance/query-engine.ts` — `query(index: SeanceIndex, q: string): SeanceResponse` with the five intent patterns (Req 6.1–6.7, Design § 6.2–6.4)

### 2e — Unit tests

- [ ] **T2.19** Write `test/analyzer/metrics.test.ts` — test each metric against fixture files in `test/fixtures/` (Req 10.1)
- [ ] **T2.20** Write `test/analyzer/scoring.test.ts` — test score formula edge cases: all-zero metrics → score 0; all-max metrics → score 100 (Req 3.1–3.3)
- [ ] **T2.21** Write `test/analyzer/graph.test.ts` — test cycle detection: no cycles, two-node cycle, three-node cycle (Req 2.9)
- [ ] **T2.22** Write `test/analyzer/duplicates.test.ts` — test hash deduplication, window merging (Req 2.8)
- [ ] **T2.23** Write `test/seance/query-engine.test.ts` — test each intent pattern returns correct answer and citations (Req 6.1–6.7)
- [ ] **T2.24** Create fixture files in `test/fixtures/`: `tiny.ts` (clean), `nested.ts` (deep nesting), `circular-a.ts` + `circular-b.ts` (cycle pair), `todos.ts` (multiple TODOs), `duplicate.ts` + `duplicate2.ts` (copy-pasted blocks) (Req 10.3)

---

## Milestone 3 — Frontend Haunted House

- [ ] **T3.1** Create `public/index.html` — SPA shell: input form (URL field, folder picker, demo button), SVG container, haunting meter bar, ghost detail panel sidebar, séance chat panel (Req 9.1–9.7)
- [ ] **T3.2** Create `public/styles.css` — Halloween colour palette (deep purple, orange, ghostly white), responsive layout, ghost icon SVG sprites, haunting-score gradient (green → amber → red)
- [ ] **T3.3** Implement `public/floor-plan.js` — `renderFloorPlan(result: AnalysisResult, svgEl: SVGElement)`: compute room sizes from LOC, draw rooms with score-based fill colour, draw furniture elements per file, overlay ghost icon glyphs (Req 9.1–9.2)
- [ ] **T3.4** Implement `public/app.js` — application shell: input handling (URL submit, folder upload, demo button), call `/api/analyze` or `/api/demo`, render floor plan, render global haunting meter, wire ghost click → detail panel (Req 9.1–9.4)
- [ ] **T3.5** Add ghost detail panel logic to `public/app.js` — on ghost click, populate sidebar with exorcism report fields (display name, explanation, fix suggestion, score impact) (Req 9.4)
- [ ] **T3.6** Implement `public/seance-ui.js` — séance chat widget: text input, send button, POST `/api/seance`, render answer + citation links; citation click scrolls SVG to referenced file furniture element (Req 9.5–9.6)
- [ ] **T3.7** Implement haunting meter rendering in `public/app.js` — animated fill bar 0–100 with numeric label and colour encoding (Req 9.3)

---

## Milestone 4 — MCP Server, Agents, Hooks, PBT

### 4a — MCP server

- [ ] **T4.1** Implement `src/mcp-server/tools.ts` — tool handler functions for `analyze_repo`, `list_ghosts`, `get_file_haunting`, `ask_seance`; reuse the analyser and séance engine (Req 8.2–8.5)
- [ ] **T4.2** Implement `src/mcp-server/server.ts` — stdio MCP server: JSON-RPC 2.0 framing, `initialize` / `tools/list` / `tools/call` handlers, error response shaping (Req 8.1)
- [ ] **T4.3** Register MCP server in `.kiro/settings/mcp.json` with key `"poltergeist"`, command `"node"`, args `["dist/mcp-server/server.js"]` (Req 8.6)

### 4b — Custom agents

- [ ] **T4.4** Create `.kiro/agents/ghost-hunter.md` — custom agent that calls `list_ghosts` and produces a prioritised exorcism plan for the most haunted module
- [ ] **T4.5** Create `.kiro/agents/seance-master.md` — custom agent that calls `ask_seance` in a loop and maintains a conversational context summary

### 4c — Hooks

- [ ] **T4.6** Create `.kiro/hooks/analyze-on-save.json` — `PostFileSave` hook that runs `npm run build` when a `.ts` file is saved, so the MCP server artefact stays current
- [ ] **T4.7** Create `.kiro/hooks/ghost-report-on-task.json` — `PostTaskExec` hook that calls `list_ghosts` via the MCP server and appends a summary to the session context

### 4d — Property-based tests

- [ ] **T4.8** Write `test/pbt/scoring.pbt.ts` — fast-check: `∀` random `FileMetrics` → `0 ≤ score ≤ 100` (Req 10.2)
- [ ] **T4.9** Write `test/pbt/monotonicity.pbt.ts` — fast-check: `∀` metrics `m`, `∀` key `k`, incrementing `m[k]` does not decrease the score (Req 10.2)
- [ ] **T4.10** Write `test/pbt/rollup.pbt.ts` — fast-check: module rollup of any array of (score, loc) pairs stays in [0, 100] (Req 10.2)

---

## Milestone 5 — README, Polish, Demo Script

- [ ] **T5.1** Write `README.md` — project overview, quick-start (clone → `npm install` → `npm run dev`), screenshot/GIF placeholder, MCP setup instructions, ghost type glossary, séance example queries
- [ ] **T5.2** Write `demo-script.md` — step-by-step walkthrough for a live demo: open app, analyse demo repo, point out the haunted rooms, click a ghost, run a séance query, show MCP tool call in Kiro
- [ ] **T5.3** Add CSS polish: ghost floating animations (`@keyframes`), room hover glow, séance panel typewriter effect for answers
- [ ] **T5.4** Add global error boundary in `public/app.js` — catch fetch errors, display friendly error messages in the UI with retry option
- [ ] **T5.5** Performance review: ensure analyser handles projects of ≥ 500 files without hanging the event loop (use `setImmediate` yield points if needed)
- [ ] **T5.6** Final audit against requirements — verify every Req N.M has a corresponding passing test or demonstrable behaviour; update this checklist
- [ ] **T5.7** Verify `git status` is clean (all files committed) before submission
