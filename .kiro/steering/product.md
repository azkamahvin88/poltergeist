---
inclusion: always
---

# Poltergeist — Product Overview

## What It Is

Poltergeist is a haunted codebase explorer. It analyses JavaScript and TypeScript projects and visualises every code smell as a ghost haunting a room in a hand-drawn SVG floor plan. The worse the code quality, the more intensely the room glows with a sickly orange light.

The project is a submission to the Kiroween 2026 hackathon (category: Frankenstein — a mashup of two ideas: code analysis and a haunted house).

## Audience

Developers who have inherited a legacy codebase and need a fast, human-readable picture of where the technical debt lives. Rather than drowning in a wall of linting errors, they get a floor plan they can actually point at in a team meeting: "The `payments` module is basically on fire."

## Key Features

- **Haunted house floor plan** — SVG layout where each directory is a room and each file is furniture. Room colour encodes the haunting score (green → amber → hellish red).
- **Six ghost types** — each maps to a concrete code smell: dead code, duplication, deep nesting, circular dependencies, TODO/FIXME markers, and bloated files or functions.
- **Exorcism reports** — click any ghost to get an explanation of the smell and a concrete fix suggestion.
- **Séance mode** — deterministic Q&A about the codebase: "where is `parseFile` defined?", "what is the most haunted file?", "what depends on `auth.ts`?". Answers come with file:line citations. No LLM required.
- **MCP server** — exposes the analysis engine as a Model Context Protocol server so AI agents (including Kiro) can query the codebase analysis directly.
- **Multiple input sources** — paste a public GitHub URL, upload a local folder, or analyse the Poltergeist repo itself (dogfood demo).

## Tone

Spooky but professional. The UI leans into Halloween — dark backgrounds, flickering ghost animations, séance candlelight aesthetics — but all labels, reports, and messages are precise and useful. The horror is decorative; the analysis is serious.

Naming conventions follow the haunted-house theme throughout (ghosts, exorcism, séance, haunting score), but every piece of terminology has a 1:1 mapping to a real software engineering concept so the metaphor never obscures the meaning.
