# DEMO.md — Poltergeist demo script (< 3 minutes)

For the Kiroween demo video. All beats use the live app at
http://localhost:3000 (run `npm run dev` first) — no API key needed.

## Beats

### 0:00–0:25 — The hook
- Open the app. "Every team inherits a haunted codebase. Poltergeist makes the
  ghosts visible."
- Paste `https://github.com/azkamahvin88/poltergeist` into the repo URL field,
  click **Haunt this repo**.

### 0:25–1:00 — The house appears
- Loading shimmer, then the floor plan: one room per module (`public`, `src`,
  `test`), sized by code share, furniture coloured by haunting score.
- Point at the meter: overall score **24/100 — eerie**, 18 ghosts, 25 files.
- Hover a red room (`public`, score 38): "this is where the haunting is worst."

### 1:00–1:40 — Exorcise a ghost
- Click a 👻 marker on `src/analyzer/parser.ts` (a Poltergeist/duplication ghost).
- Detail panel opens: ghost name, `file:line`, description, and the exorcism
  report — explanation, concrete fix suggestion, estimated score reduction.
- "Every ghost comes with its own banishment instructions."

### 1:40–2:20 — Séance
- Click the chip **"Which file is the most haunted?"** — answer appears with a
  `file:line` citation.
- Click the citation: the floor plan jumps to that file.
- Ask **"Where is analyzeFiles defined?"** — second answer, second citation.
- "No LLM, no API key — answers come from the analysis index, offline."

### 2:20–2:50 — MCP (terminal)
- Switch to terminal: pipe `initialize` + `tools/call analyze_repo` into
  `npm run mcp`. Show the JSON reply: score, ghost counts, top ghosts.
- "Kiro agents can haunt any repo with four tools: analyze_repo, list_ghosts,
  get_file_haunting, ask_seance."

### 2:50–3:00 — Close
- Back to the house. "Paste a repo. See the ghosts. Exorcise them.
  Poltergeist — built with Kiro for Kiroween 2026, Frankenstein category."

## Fallbacks (if the network misbehaves on camera)
- GitHub tarball fetch is unauthenticated (60/hr). If it fails, click
  **Analyze this repo (demo)** instead — same UI, same ghosts, zero network.
- Folder upload works fully offline as a third path.
