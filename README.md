# Git Visualizer

> A virtual web terminal where you type **real Git commands**, executed by a Git
> engine reimplemented from scratch in TypeScript, and watch the commit DAG
> (branches, merges, rebases, remotes) render live as you go.

A learning playground for Git. No real filesystem, no real network — everything
runs in the browser against a deterministic in-memory engine, so the same
sequence of commands always produces the same graph. Type `git`, see the tree.

🇫🇷 _Une version française de ce document est disponible : [README.fr.md](./README.fr.md)._

---

## Why

Most "learn Git" tools either animate a fixed script or wrap the real `git`
binary. Git Visualizer does neither: it **reimplements Git's semantics** (objects,
refs, index, working tree, history rewriting) in pure, headless-testable
TypeScript, then renders the resulting model as a colored DAG. You can break
things, rewrite history, resolve conflicts, push/pull against a simulated remote
— and *see* exactly what each command does to the graph.

## Features

### A real(ish) Git engine

- **Objects & deterministic hashing** — blobs, trees, commits with a pure SHA-1
  over a canonical string (deterministic, but **not** byte-identical to real Git).
- **Full repository model** — refs (branches/tags), symbolic & detached HEAD,
  staging index, virtual working tree, reflog, stash, remotes & upstream tracking.
- **30+ Git commands** (see [below](#supported-git-commands)) including history
  rewriting (`rebase`, including **interactive** `rebase -i`), 3-way merges with
  conflict markers, `cherry-pick`, `revert`, `reset --soft/--mixed/--hard`.
- **Remotes without a network** — `clone`/`fetch`/`push`/`pull` reduce to copying
  content-addressed objects between in-memory stores, so a pushed commit keeps
  its exact hash on both sides.
- **Git-faithful errors** — user errors return git-style messages and exit codes,
  never exceptions.

### Visualization & UX

- **Live commit DAG** — custom SVG layout (topological sort → lanes → colors →
  geometry) with pan/zoom, branch/tag/HEAD badges, and smooth transition
  **animations** for commits, merges, rebases and resets.
- **Split-screen remote view** — local | remote graphs side by side, with
  highlights for unpushed / unfetched commits.
- **xterm.js terminal** — command history (↑/↓), Tab autocompletion (commands,
  flags, refs), ANSI-colored `git diff` / `git log --graph` output.
- **Conflict editor** — 3-way (ours / theirs / result) modal instead of editing
  `<<<<<<<` markers by hand.
- **Interactive rebase modal** — reorder / pick / reword / squash / fixup / drop.
- **Guided tutorials & scenarios** — step-by-step lessons with auto-validated
  objectives, plus pre-built repository scenarios.
- **Command palette** (`Ctrl/Cmd+K`), clickable refs & commit context menus.
- **Dark theme**, responsive layout, keyboard navigation, ARIA on the graph.
- **i18n** — French / English UI (Git error messages stay in English, like real Git).
- **Persistence** — your session is restored on reload by deterministic replay.

## Architecture

The guiding principle: **all Git semantics live in `src/core/` (pure TypeScript,
zero Vue imports) and are testable headless via Vitest.** The UI (Pinia store +
Vue components + xterm + SVG) only parses input and renders state — it contains
no Git logic.

```
xterm (TerminalPanel) → store.execute(cmd) → core/engine.execute()
                                                   ↓ mutates the Repository
        reactive Pinia snapshot ← (graph, sidebar, status) re-render
```

| Layer            | Location            | Responsibility                                                        |
| ---------------- | ------------------- | --------------------------------------------------------------------- |
| **Engine**       | `src/core/`         | `engine.ts` (stable public entry), `parser.ts`, `repository.ts`, `objectStore.ts`, `commands/` (one module per command), `model/`. |
| **Store**        | `src/stores/repo.ts`| Pinia façade — owns the engine instance, exposes `execute()` + a frozen reactive snapshot. The **only** bridge between UI and engine. |
| **Graph layout** | `src/graph/`        | Pure layout algorithm consumed by `GraphCanvas.vue` (no gitgraph lib — reset/rebase rewrite history, so rendering is driven by our own model). |
| **Components**   | `src/components/`   | `TerminalPanel`, `GraphView`/`GraphCanvas`, `RefsSidebar`, conflict & rebase modals, command palette… |

The engine exposes an immutable, frozen `snapshot()` for the UI; the store places
it in a reactive `ref`. Layout (`computeLayout`), diff (`diffSides`), the
tokenizer, `.gitignore` matching and conflict parsing are all **pure functions**.

## Getting started

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
```

Then open the terminal pane and type, for example:

```bash
git init
write hello.txt "first line"     # `write`/`read` are virtual-FS helpers
git add hello.txt
git commit -m "initial commit"
git checkout -b feature
write hello.txt "second line"
git commit -am "work on feature"
git checkout main
git merge feature
```

…and watch the graph update after every command.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # vue-tsc -b (strict typecheck) + production build
npm run typecheck    # typecheck only
npm test             # Vitest, single run (1185+ tests)
npm run test:watch   # Vitest in watch mode
npm run lint         # ESLint (.ts/.vue)
npm run format       # Prettier
npx vitest run tests/engine.test.ts   # a single test file
```

## Supported Git commands

| Category                | Commands                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| Setup & config          | `init`, `config`, `help`                                                  |
| Snapshotting            | `add`, `status`, `commit`, `rm`, `mv`, `restore`, `.gitignore` support   |
| Branching & navigation  | `branch`, `checkout` (`-b`, `--detach`, `-- <path>`), `switch`, `tag`     |
| Inspection              | `log` (`--graph`, `--oneline`), `diff` (`--staged`, `<a> <b>`), `show`, `reflog`, `rev-parse` |
| Merging & rewriting     | `merge` (`--no-ff`, `--abort`, `--continue`), `reset`, `revert`, `cherry-pick`, `rebase`, `rebase -i` |
| Stashing                | `stash` (`push`/`list`/`pop`/`apply`/`drop`)                              |
| Remotes                 | `remote`, `clone`, `fetch`, `push` (`-u`, `-f`), `pull` (`--rebase`)      |
| Revisions               | `HEAD~n`, `<ref>~n`, `HEAD@{n}`, `@{upstream}`/`@{u}`, `<remote>/<branch>`, short hashes |

`git help` / `git help <command>` reads from a single command catalog
(`src/core/catalog.ts`) that also powers Tab autocompletion.

## Project layout

```
src/
  core/            # the Git engine (pure TS, no Vue) — engine, parser, repository,
    commands/      #   objectStore, diff, gitignore, tokenizer, sha1, + one file per command
  graph/           # pure layout / culling / ASCII-graph algorithms
  stores/          # Pinia store (repo.ts) — the UI↔engine façade
  components/      # Vue components (terminal, graph, sidebar, modals, palette)
  composables/     # theme, graph animations
  constants/       # scenarios, tutorials, predefined remotes
  i18n/            # FR/EN messages
  utils/           # autocomplete, storage, shell chaining, command palette search
tests/             # Vitest suites (engine + components)
docs/
  specs/           # numbered feature specs (source of truth for tests)
  USAGE.md         # full user-facing command reference
  ROADMAP.md       # post-Phase-6 roadmap
```

## Development workflow

The project is built phase by phase. Each feature (and every non-trivial Git
command) follows a **5-step cycle**, with each step delegated to a specialized
agent: **specs → docs → dev → tests → QA**. Reference behavior is real `git`.

Conventions enforced at review:

- **No Git logic in components or the store** — only in `core/`. The store is a
  thin façade.
- The engine never throws for user errors — it returns `fail([...])` with
  git-style messages. `throw` is reserved for internal bugs.
- Every command added under `core/commands/` ships with its Vitest tests.
- Tests are derived from `docs/specs/`, not from the implementation.
- Strict TypeScript everywhere (`noUnusedLocals` / `noUnusedParameters` are on —
  `npm run build` fails on an unused import).

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture notes and phase history,
and [`docs/USAGE.md`](./docs/USAGE.md) for the complete command reference.

## Tech stack

Vue 3 · Vite · Pinia · TypeScript (strict) · xterm.js · Vitest · custom SVG layout.

## License

[MIT](./LICENSE)
