# 👻 POLTERGEIST — Haunted Codebase Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 24](https://img.shields.io/badge/Node-%3E%3D%2024-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Built with Kiro](https://img.shields.io/badge/Built%20with-Kiro-purple.svg)](https://kiro.dev/)

**Kiroween 2026 hackathon entry — Category: Frankenstein.**

Paste a public GitHub repo URL (or upload a code folder) and Poltergeist scans the
codebase and draws it as a **haunted house**: each module is a room, each file is a
piece of furniture, and every code smell is a **ghost**. Click a ghost for its
*exorcism report* — what it is, why it haunts you, and how to banish it. Ask the
house anything in **Séance mode**, and it answers from the analysis index — no
external LLM, no API key, fully deterministic and offline.

> Dogfooding: the built-in demo analyzes this very repository.
> Latest self-scan (23 Nov 2026): **overall haunting score 24/100, 18 ghosts
> across 25 files** (modules: `public` 38, `src` 26, `test` 8).

## Quick start

```bash
git clone https://github.com/azkamahvin88/poltergeist.git
cd poltergeist
npm install
npm run dev        # builds, then serves on http://localhost:3000
```

Open <http://localhost:3000>, paste a repo URL, and watch the ghosts move in.

| Command | What it does |
|---|---|
| `npm run build` | Compile TypeScript (`src/` → `dist/`) |
| `npm run dev` | Build + serve the app (port `PORT`, default 3000) |
| `npm start` | Serve the already-built app |
| `npm test` | Build + run all tests (Node built-in runner + fast-check) |
| `npm run mcp` | Start the MCP server on stdio |

Requirements: **Node.js ≥ 24**. No other runtime dependencies, no API keys.

## How to use

1. **Haunt a repo** — paste a public GitHub URL (`https://github.com/<owner>/<repo>`)
   and click *Haunt this repo*, or upload a local folder (folder picker), or click
   *Analyze this repo (demo)* to scan Poltergeist itself.
2. **Read the house** — the SVG floor plan shows one room per module, sized by
   share of code; furniture is coloured by file haunting score (green → amber →
   red). The meter shows the overall score: **calm** (≤ 20), **eerie** (≤ 50),
   **haunted** (≤ 75), **cursed** (> 75).
3. **Exorcise a ghost** — click any 👻 marker (or a file, or a room) to open the
   detail panel: ghost type, `file:line`, description, and the full exorcism
   report (explanation, concrete fix suggestion, estimated score reduction).
4. **Hold a séance** — ask questions such as:
   - *Which file is the most haunted?*
   - *Where is `analyzeFiles` defined?*
   - *What depends on `analyzer.ts`?*
   - *List all poltergeist ghosts*
   
   Answers come with `file:line` citations; clicking a citation jumps to that
   file in the floor plan. Questions the index cannot answer get an honest
   "I don't know" plus the list of supported question shapes.

## The ghosts

| Ghost | Detects |
|---|---|
| **The Lingering Dead** | Dead code — exports never imported anywhere in the project |
| **The Poltergeist** | Duplication — identical 6+ line blocks (normalised-line hashing) |
| **The Maze Keeper** | Deep nesting / high cyclomatic complexity |
| **The Ouroboros** | Circular dependencies (Tarjan SCC on the import graph) |
| **The Forgotten** | `TODO` / `FIXME` / `HACK` comments left behind |
| **The Behemoth** | Huge files / over-long functions |

Per-file metrics: LOC/SLOC, function count and length, max nesting depth,
cyclomatic complexity (branching approximation), TODOs, imports/exports,
duplicate blocks. Haunting score is a weighted 0–100 per file; module scores
are LOC-weighted means of their files.

## API reference

All JSON. `POST /api/analyze` bodies are capped at 10 MB; analyzed code is
**parsed only, never executed**.

| Endpoint | Description |
|---|---|
| `GET /api/health` | `{ "status": "ok" }` |
| `GET /api/demo` | Analyze this repo itself; returns an `AnalysisResult` |
| `POST /api/analyze` | `{ "repoUrl": "https://github.com/<owner>/<repo>" }` or `{ "files": [{ "path", "content" }] }` → `AnalysisResult` (includes a `sessionId`) |
| `POST /api/seance` | `{ "question", "sessionId" }` or `{ "question", "analysis" }` → `{ "answer", "citations": [{ "file", "line" }] }` |

`AnalysisResult` shape: `{ repoName, analyzedAt, sessionId, files: FileReport[],
modules: ModuleRollup[], totalGhosts, overallScore, ghosts: Ghost[] }`.

## MCP server

Poltergeist ships a stdio MCP server so Kiro (or any MCP client) can haunt
codebases directly. It is registered in `.kiro/settings/mcp.json`:

```json
{"mcpServers": {"poltergeist": {"command": "node",
  "args": ["dist/mcp-server/main.js"], "cwd": "${workspaceFolder}"}}}
```

Run it manually with `npm run mcp`. Tools:

| Tool | Description |
|---|---|
| `analyze_repo` | Analyze a local path (`repoPath`) or GitHub URL (`repoUrl`); returns score, ghost counts, top 10 ghosts |
| `list_ghosts` | All ghosts in a repo, optionally filtered by `type` |
| `get_file_haunting` | `FileReport` for one file (score, metrics, ghosts) |
| `ask_seance` | Deterministic séance answer with citations |

## How Kiro was used

This project was built with **Kiro CLI** (`kiro-cli chat --no-interactive`),
spec-driven from the start. Every build prompt is saved in the project
workspace under `prompts/` (`01-spec.md` … `05-readme-polish.md`).

| Kiro power | Where it lives |
|---|---|
| Spec-driven development | `.kiro/specs/poltergeist/{requirements.md, design.md, tasks.md}` — 46 EARS requirements, architecture + scoring formula, 55 implementation tasks |
| Steering docs | `.kiro/steering/{product.md, tech.md, structure.md}` — always-on product, stack, and convention context |
| Custom agents | `.kiro/agents/exorcist.md` (concrete minimal fixes for a ghost) and `.kiro/agents/medium.md` (citation-mandatory séance answers) |
| Agent hooks | `.kiro/hooks/on-save.json` (rebuild on `.ts` save) and `.kiro/hooks/pre-task-check.json` (build + test gate before a task runs) |
| MCP | `src/mcp-server/` + `.kiro/settings/mcp.json` (see above) |
| Property-based testing | `test/property.test.mjs` — fast-check properties for scoring (bounds 0–100, monotonicity, determinism, severity bands) and duplicate detection |

**Honest note on tooling:** milestones 1–4 were built entirely through Kiro CLI.
During milestone 5 (this README, `DEMO.md`, final polish) the Kiro account hit
its **monthly request quota** (`MONTHLY_REQUEST_COUNT`, 23 Nov 2026), so the
finishing work was completed with the standard model instead. The Kiro-built
share is the spec, analyzer, server, frontend, MCP server, agents, hooks, and
all tests. The free 4,000-credit request for Kiroween participants (deadline
1 Dec 2026 12:00 PT) is still to be filed by the repo owner.

## Project structure

```
poltergeist/
├── .kiro/                  # specs, steering, agents, hooks, MCP registration
│   ├── specs/poltergeist/  # requirements.md, design.md, tasks.md
│   ├── steering/           # product.md, tech.md, structure.md
│   ├── agents/             # exorcist.md, medium.md
│   ├── hooks/              # on-save.json, pre-task-check.json
│   └── settings/mcp.json   # MCP server registration
├── src/
│   ├── analyzer/           # parser, scoring, duplicates, graph, ghosts,
│   │                       # analyzer, seance, github, tarball, types
│   ├── server/             # http server, routes, session store, logger
│   └── mcp-server/         # stdio JSON-RPC transport + tools
├── public/                 # index.html, app.js, styles.css (vanilla JS + SVG)
├── test/                   # node:test suites + fast-check property tests
├── DEMO.md                 # minute-by-minute demo script (< 3 min video)
└── package.json
```

## Testing

```bash
npm test   # 63 tests, 0 failures (54 unit/integration + 9 property-based)
```

Unit/integration tests (`test/*.test.mjs`) cover scoring, parser, duplicates,
graph cycles, séance intents, and the HTTP server (including a live
`/api/analyze` with inline files). Property tests use fast-check on the pure
scoring/duplicate functions.

## Constraints & limitations

- **No external LLM and no API key.** Séance answers are deterministic
  retrieval over the analysis index; if the index has no answer, it says so.
- **Analyzed code is never executed** — it is parsed with the TypeScript
  compiler API only. Imports are resolved statically (`.js` → `.ts` ESM
  mapping included).
- GitHub tarball fetch is unauthenticated (60 requests/hour); if the limit is
  hit, use the folder upload or the built-in demo instead.
- Analysis caps: 500 files per repo, 2 MB per file (extras are skipped and noted).
- Only JS/TS sources (`.ts/.tsx/.js/.jsx/.mjs/.cjs`) are analyzed; other files
  are ignored.
- The demo numbers above come from scanning this repo itself; your mileage
  (and your ghosts) will vary.

## License

MIT — see [LICENSE](LICENSE).
