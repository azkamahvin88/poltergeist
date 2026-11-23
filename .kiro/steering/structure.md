---
inclusion: always
---

# Poltergeist — Repo Structure & Conventions

## Directory Layout

```
poltergeist/
├── .kiro/
│   ├── agents/          # Custom Kiro agent definitions (.md)
│   ├── hooks/           # Event-driven automation hooks (.json)
│   ├── settings/        # mcp.json and other IDE settings
│   ├── specs/
│   │   └── poltergeist/ # requirements.md, design.md, tasks.md
│   └── steering/        # Always-on context files for the AI (product.md, tech.md, structure.md)
├── src/
│   ├── analyzer/        # Pure analysis logic — no I/O, no HTTP
│   │   ├── parser.ts
│   │   ├── metrics.ts
│   │   ├── scoring.ts
│   │   ├── graph.ts
│   │   ├── duplicates.ts
│   │   └── index.ts
│   ├── server/          # HTTP server, routes, session store, fetcher
│   │   ├── http-server.ts
│   │   ├── routes.ts
│   │   ├── session-store.ts
│   │   ├── fetcher.ts
│   │   ├── logger.ts
│   │   └── main.ts      # Entry point: reads PORT, starts server
│   ├── mcp-server/      # Stdio MCP server
│   │   ├── server.ts
│   │   └── tools.ts
│   ├── seance/          # Séance index builder and query engine
│   │   ├── index-builder.ts
│   │   └── query-engine.ts
│   └── types.ts         # All shared TypeScript interfaces and types
├── public/              # Static frontend — served as-is, no build step
│   ├── index.html
│   ├── app.js
│   ├── floor-plan.js
│   ├── seance-ui.js
│   └── styles.css
├── test/
│   ├── analyzer/        # Unit tests for analyzer modules
│   ├── server/          # Route handler integration tests
│   ├── seance/          # Séance engine unit tests
│   ├── pbt/             # fast-check property-based tests
│   └── fixtures/        # Static .ts/.js files used as test input
├── dist/                # Compiled JS output (gitignored)
├── .gitignore
├── LICENSE
├── package.json
├── tsconfig.json
├── README.md            # Added in Milestone 5
└── demo-script.md       # Added in Milestone 5
```

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Source files | `kebab-case.ts` | `index-builder.ts` |
| Test files | `<subject>.test.ts` | `scoring.test.ts` |
| PBT files | `<subject>.pbt.ts` | `monotonicity.pbt.ts` |
| TypeScript interfaces | `PascalCase` | `FileReport`, `AnalysisResult` |
| TypeScript type aliases | `PascalCase` | `GhostType` |
| TypeScript enums | `SCREAMING_SNAKE_CASE` values | `'LINGERING_DEAD'` |
| Functions | `camelCase` | `computeScore()` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_BYTES` |
| CSS classes | `kebab-case` | `.ghost-icon`, `.haunting-meter` |
| HTML IDs | `kebab-case` | `#floor-plan`, `#seance-input` |

## Module Boundaries

- **`src/analyzer/`** — pure functions only. No `import` of `node:http`, `node:fs`, or anything I/O-related. Takes `FileEntry[]`, returns analysis data structures. This makes it testable in isolation.
- **`src/server/`** — all network and filesystem I/O lives here. Imports from `src/analyzer/` and `src/seance/` but not from `src/mcp-server/`.
- **`src/mcp-server/`** — imports from `src/analyzer/` and `src/seance/` only. Must not import from `src/server/`.
- **`src/seance/`** — pure functions. Takes `AnalysisResult`, returns `SeanceIndex` or `SeanceResponse`. No I/O.
- **`src/types.ts`** — imported by everything. Must have zero imports from other `src/` modules (no circular dependency at the type layer).

## Logging

- Use `src/server/logger.ts` everywhere in `src/server/` and `src/mcp-server/`.
- **Never use `console.log`** in server or analyser code. Use `logger.info()`, `logger.warn()`, `logger.error()`.
- `console.log` is acceptable in ad-hoc scripts and test files only.
- Log lines are JSON objects written to `stderr`: `{ "level": "INFO", "ts": "...", "msg": "...", ...fields }`.

## Error Handling

- Server route handlers must wrap all logic in `try/catch` and return structured JSON errors.
- Analyser functions should throw typed errors (`AnalysisError extends Error`) rather than returning `null` for failure cases.
- Never swallow errors silently — either log them at WARN/ERROR or rethrow.

## User-Facing Strings

All user-facing strings (UI labels, error messages, exorcism report text, séance answers) must be written in English. No localisation layer is needed; hardcoding English is fine.

## Git Hygiene

- Commit `.kiro/` — it must stay in the repo (hackathon requirement).
- Do not commit `dist/`, `node_modules/`, `.env`, or log files.
- Commit messages follow conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
