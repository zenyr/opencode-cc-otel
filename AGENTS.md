# AGENTS

## Lang/style

- no data loss > all
- concision > grammar (strict, esp docs)
- fragments/abbrv OK (`req/res/msg/arr/obj/fn`)
- all docs must be written in English
- all code comments must be written in English

## TS/Code rules

- prefer `const` fn decl (arrow fn). class allowed.
- ban `as` + nonnull assertion (`!`) in prod code.
- exception: tests only, or clear verbosity win.

## Runtime/toolchain

- bun-first, no node-first flows.
- use:
  - `bun <file>` (not `node`, `ts-node`)
  - `bun test` (not jest/vitest)
  - `bun build <entry>` (not webpack/esbuild cli flow)
  - `bun install` (not npm/yarn/pnpm install)
  - `bun run <script>` (not npm/yarn/pnpm run)
  - `bunx <pkg> <cmd>` (not npx)
- bun auto-loads `.env`; avoid `dotenv`.

## API prefs (Bun)

- HTTP server: `Bun.serve()` over express.
- sqlite: `bun:sqlite` over better-sqlite3.
- redis: `Bun.redis` over ioredis.
- postgres: `Bun.sql` over pg/postgres.js.
- websocket: built-in `WebSocket` over ws.
- files: prefer `Bun.file` over node fs read/write.
- shell: prefer `Bun.$` over execa.

## Frontend

- use HTML import w/ `Bun.serve()`.
- avoid vite by default.
- bun handles TSX/JSX/CSS/Tailwind bundling via HTML entry.

## Test

- std runner: `bun test`
