---
inclusion: always
---

# Poltergeist — Tech Stack & Commands

## Runtime & Language

- **Node.js 24** (use `node:` protocol imports for built-ins — e.g. `import { createServer } from 'node:http'`)
- **TypeScript 5.x**, `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- Compiled output goes to `dist/`; source lives in `src/`

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Compiler API for AST parsing (never executes user code) |
| `fast-check` | Property-based testing (PBT) |
| `@types/node` | Node.js type definitions |

No Express, Fastify, React, Vue, or any other application-level framework.  
No external LLM or AI API — the séance engine is deterministic regex + index lookup.  
No authentication libraries — the app has no user accounts.

## Commands

```bash
# Install dependencies
npm install

# Compile TypeScript to dist/
npm run build

# Run all tests (node:test runner + fast-check PBT)
npm test

# Start the HTTP server on PORT (default 3000) in watch/reload mode (development)
npm run dev

# Start the compiled server (production)
npm start
```

Suggested `package.json` scripts:

```json
{
  "build": "tsc",
  "dev":   "node --watch --loader ts-node/esm src/server/main.ts",
  "start": "node dist/server/main.js",
  "test":  "node --test"
}
```

> `npm test` discovers all `*.test.ts` files via `node --test` glob. Tests run once and exit (no watch mode in CI).

## TypeScript Strictness

All files must pass with:
```
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true
```

Do not use `any` without a `// eslint-disable` comment explaining why.  
Prefer `unknown` over `any` for external data, then narrow with type guards.

## Testing Stack

- **Unit tests**: Node built-in `node:test` + `node:assert/strict` — no Jest, Mocha, or Vitest.
- **Property-based tests**: `fast-check` — place in `test/pbt/`, import with `import fc from 'fast-check'`.
- Tests must NOT make real network requests and must NOT import or execute user-supplied code.

## HTTP Server

Built on `node:http` only. No framework. Routing is a plain switch/if on `req.method + req.url`.

## Frontend

Vanilla JavaScript (ES2022 `<script type="module">`) served as static files from `public/`.  
No bundler (no Vite, Webpack, Rollup). No npm packages in the browser.  
SVG is generated and mutated programmatically via the DOM API.
