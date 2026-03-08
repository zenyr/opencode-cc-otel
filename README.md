# opencode-cc-otel

OpenCode plugin monorepo for Claude Code telemetry payload compatibility work.

## Goal

- Match Claude Code telemetry payload spec as closely as OpenCode plugin surface allows
- Keep Claude-compatible payload shape as canonical target, not `opencode.*` normalized events
- Document exact gaps where OpenCode plugin API cannot expose Claude-required fields
- Support `firstParty` and `secondParty` today, keep `thirdParty` explicit but unsupported

## Channel model

- `firstParty`: Anthropic-owned / Claude official endpoint reporting
- `secondParty`: core repo goal, OTEL reporting for team and enterprise usage
- `thirdParty`: reserved for Datadog, Segment, warehouse, or analytics forwarding, unsupported yet
- `firstParty` and `secondParty` can run independently or together via config

## Current repo state

- Canonical domain model now tracks Claude-compatible 1P and 2P event names
- Main runtime emits Claude-style 1P batch events and Claude-style 2P OTEL logs or metrics for supported flows
- `thirdParty` remains disabled and unsupported

## What this is

- Telemetry packages for OpenCode plugins
- Bun + Turbo monorepo
- Hexagonal boundaries: `domain` -> `application` -> `adapters` -> `main`
- Single deployable package: `opencode-cc-otel` (`packages/main`)

## Current status

- Shared Claude-compatible event and metric contracts live in `packages/domain`
- Application layer supports deterministic buffering + explicit flush
- Adapters provide 1P Anthropic batch, 2P OTEL JSON, console, in-memory, durable queue, and fanout sinks
- Main package maps OpenCode hooks to supported Claude prompt/tool/command/API/diff telemetry paths
- Monorepo verification covers domain, application, adapters, and main package contracts
- Exact Claude parity is still partial where plugin API lacks source fields

## Runtime env

- `OPENCODE_TELEMETRY_SINK`: `console`, `http`, or `otel-json`
- `OPENCODE_TELEMETRY_HTTP_ENDPOINT`: required when sink is `http`
- `OPENCODE_TELEMETRY_HTTP_TOKEN`: optional bearer token for HTTP sink
- `OPENCODE_TELEMETRY_HTTP_MAX_ATTEMPTS`: retry cap, default `8`
- `OPENCODE_TELEMETRY_HTTP_BACKOFF_MS`: base backoff, default `500`
- `OPENCODE_TELEMETRY_QUEUE_DIR`: optional disk queue dir for failed batch replay
- `OPENCODE_TELEMETRY_SERVICE_NAME`: service name for `otel-json`, default `claude-code`
- `OPENCODE_TELEMETRY_SERVICE_VERSION`: service version for `otel-json`, default `0.1.0`
- `OPENCODE_TELEMETRY_LOGS_CHANNEL_ID`: logs channel id for `otel-json`, default `otel_3p_logs`
- `OPENCODE_TELEMETRY_METRICS_CHANNEL_ID`: metrics channel id for `otel-json`, default `otel_3p_metrics`
- `OPENCODE_TELEMETRY_MAX_BATCH_SIZE`: app buffer size, default `1`
- `OPENCODE_TELEMETRY_FLUSH_INTERVAL_MS`: reserved policy value, default `0`

Legacy env-only sink selection still works, but channel-aware JSONC config should be treated as the preferred direction.

## Config file

- XDG config path: `~/.config/opencode/telemetry.jsonc`
- override path: `OPENCODE_TELEMETRY_CONFIG_PATH`
- example config: `telemetry.jsonc.example`
- schema source: `schemas/telemetry.schema.json`
- GitHub Pages schema URL: `https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json`
- GitHub Pages SPA source: `packages/opencode-cc-otel-web`
- local SPA dev: `bun run dev:site`
- SPA build: `bun run build:site`
- schema + SPA auto-deploy: push to `main` with schema/site changes -> `deploy-pages` workflow publishes same root
- if repo or Pages path changes, update `$id` in `schemas/telemetry.schema.json` and `$schema` in `telemetry.jsonc.example`

Preferred channel config:

- `channels.firstParty.enabled`
- `channels.firstParty.sink`
- `channels.firstParty.http.*`
- `channels.secondParty.enabled`
- `channels.secondParty.sink`
- `channels.secondParty.otel.*`
- `channels.thirdParty.enabled`
- `channels.thirdParty.enabled=false` only

## Covered telemetry

Current supported mapping covers these signal families:

- prompt: `chat.message`
- API usage/error: assistant `message.updated`
- tools: `tool.execute.after`
- permissions: `permission.ask`
- commands/git ops: `command.execute.before`, `command.executed`
- diff metrics: `session.diff`

Current emitted Claude-compatible outputs:

- 1P events: `tengu_input_prompt`, `tengu_input_command`, `tengu_tool_use_success`, `tengu_api_success`, `tengu_api_error`
- 2P logs: `claude_code.user_prompt`, `claude_code.tool_result`, `claude_code.api_request`, `claude_code.api_error`, `claude_code.tool_decision`
- 2P metrics: `session.count`, `lines_of_code.count`, `pull_request.count`, `commit.count`, `cost.usage`, `token.usage`, `code_edit_tool.decision`, `active_time.total`

## Operational behavior

- Domain layer validates Claude-compatible event and metric records
- Application buffering keeps data in memory until publish succeeds
- 1P sink retries transient failures with quadratic backoff: `baseMs * attempts^2`
- 1P sink retries one `401` once without auth
- Durable sink stores failed 1P batches on disk and replays them before new publish
- 2P sink emits Claude-style OTEL JSON logs and metrics
- Channel-aware config can fan out to enabled `firstParty` and `secondParty` together
- `thirdParty` stays unsupported and must remain disabled

## Test coverage highlights

- domain validation: Claude-compatible event names, metric units, attr validation
- app behavior: default publish, buffered flush, empty flush, invalid buffer policy rejection
- adapters: 1P batch shape, authless 401 retry, durable replay, fanout, 2P OTEL log or metric envelopes
- main wiring: prompt/tool/API/permission/command/diff mapping, startup replay handshake, thirdParty rejection

## Verify

```bash
bun test
bun run build
```

After first schema deploy, verify:

```bash
curl -I https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json
```

## Notable Reference

- https://github.com/pai4451/opencode-telemetry-plugin

## Spec refs in this repo

- `refs/metrics-parity-notes.md`
- `refs/docs/claude/telemetry-portable-summary.md`
- `refs/architecture.md`
- `refs/feature-parity.md`

## Direction

- `opencode-cc-otel` means Claude Code telemetry compatibility for OpenCode, not an `opencode.*` telemetry namespace as end-state
- If Claude raw payload and current repo model disagree, Claude payload should win unless blocked by plugin API limits
