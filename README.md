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
- Adapters provide console, in-memory, and HTTP sinks
- Main package wires OpenCode hooks to the telemetry pipeline

## Runtime env

- `OPENCODE_TELEMETRY_SINK`: `console` or `http`
- `OPENCODE_TELEMETRY_HTTP_ENDPOINT`: required when sink is `http`
- `OPENCODE_TELEMETRY_HTTP_TOKEN`: optional bearer token for HTTP sink
- `OPENCODE_TELEMETRY_HTTP_MAX_ATTEMPTS`: retry cap, default `8`
- `OPENCODE_TELEMETRY_HTTP_BACKOFF_MS`: base backoff, default `500`
- `OPENCODE_TELEMETRY_MAX_BATCH_SIZE`: app buffer size, default `1`
- `OPENCODE_TELEMETRY_FLUSH_INTERVAL_MS`: reserved policy value, default `0`

## Operational behavior

- Valid events are normalized in `packages/domain`; invalid names/timestamps fail fast
- Application buffering keeps data in memory until publish succeeds
- HTTP sink retries transient failures with quadratic backoff: `baseMs * attempts^2`
- Default runtime stays synchronous and safe: one event per publish, no background daemon

## Verify

```bash
bun test
bun run build
```

## Notable Reference

- https://github.com/pai4451/opencode-telemetry-plugin

## Spec refs in this repo

- `refs/claude-reverse/metrics-to-anthropic.md`
- `refs/claude-reverse/docs/claude/telemetry-event-names.txt`
- `refs/README.md`
