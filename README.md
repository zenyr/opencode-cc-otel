# @zenyr/opencode-cc-telemetry

OpenCode telemetry plugin monorepo.

## What this is

- Telemetry packages for OpenCode plugins
- Bun + Turbo monorepo
- Hexagonal boundaries: `domain` -> `application` -> `adapters` -> `main`
- Single deployable package: `opencode-cc-telemetry` (`packages/main`)

## Current status

- Shared event-name contracts live in `packages/domain`
- Application layer supports deterministic buffering + explicit flush
- Adapters provide console, in-memory, HTTP, durable queue, fanout, and OTEL JSON sinks
- Main package wires OpenCode hooks to prompt/tool/command/session/API telemetry paths
- Monorepo verification covers domain/app/adapter/main contracts with 44 tests

## Runtime env

- `OPENCODE_TELEMETRY_SINK`: `console`, `http`, or `otel-json`
- `OPENCODE_TELEMETRY_HTTP_ENDPOINT`: required when sink is `http`
- `OPENCODE_TELEMETRY_HTTP_TOKEN`: optional bearer token for HTTP sink
- `OPENCODE_TELEMETRY_HTTP_MAX_ATTEMPTS`: retry cap, default `8`
- `OPENCODE_TELEMETRY_HTTP_BACKOFF_MS`: base backoff, default `500`
- `OPENCODE_TELEMETRY_QUEUE_DIR`: optional disk queue dir for failed batch replay
- `OPENCODE_TELEMETRY_MIRROR_CONSOLE`: `1` enables fanout to console sink
- `OPENCODE_TELEMETRY_SERVICE_NAME`: service name for `otel-json`, default `opencode-cc`
- `OPENCODE_TELEMETRY_SERVICE_VERSION`: service version for `otel-json`, default `0.1.0`
- `OPENCODE_TELEMETRY_CHANNEL_ID`: channel id for `otel-json`, default `otel_3p_logs`
- `OPENCODE_TELEMETRY_MAX_BATCH_SIZE`: app buffer size, default `1`
- `OPENCODE_TELEMETRY_FLUSH_INTERVAL_MS`: reserved policy value, default `0`

## Covered telemetry

- prompt: `chat.message`
- API usage/error: assistant `message.updated`
- tools: `tool.execute.before`, `tool.execute.after`
- permissions: `permission.ask`
- commands/git ops: `command.execute.before`, `command.executed`
- session lifecycle: `session.created`, `session.idle`, `session.error`, `session.status`
- diffs/files: `session.diff`, `file.edited`

## Operational behavior

- Valid events are normalized in `packages/domain`; invalid names/timestamps fail fast
- Application buffering keeps data in memory until publish succeeds
- HTTP sink retries transient failures with quadratic backoff: `baseMs * attempts^2`
- Durable sink stores failed batches on disk and replays them before new publish
- OTEL JSON sink emits portable envelopes with normalized attrs for warehouse/log pipelines
- Default runtime stays synchronous and safe: one event per publish, no background daemon

## Test coverage highlights

- domain validation: event names, attr normalization, invalid timestamp/duration/custom attr rejection
- app behavior: default publish, buffered flush, empty flush, invalid buffer policy rejection
- adapters: retry/non-retry HTTP cases, durable replay, fanout, normalized OTEL envelope
- main wiring: prompt/API error path, git commit/PR detection, session status/error mapping, startup replay handshake

## Verify

```bash
bun test
bun run build
```

## Notable Reference

- https://github.com/pai4451/opencode-telemetry-plugin

## Spec refs in this repo

- `refs/metrics-to-anthropic.md`
- `refs/docs/claude/telemetry-portable.md`
- `refs/architecture.md`
- `refs/feature-parity.md`
