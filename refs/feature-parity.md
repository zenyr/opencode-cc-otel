# OpenCode Plugin Feature Parity Assessment

## Goal

Assess how close an OpenCode plugin can get to Claude Code telemetry payload compatibility using the public plugin API in `@opencode-ai/plugin@1.2.20`.

Scope:

- source refs: `refs/metrics-parity-notes.md`, `refs/docs/claude/telemetry-portable-summary.md`
- plugin surface: `@opencode-ai/plugin/dist/index.d.ts`
- event/config model: `@opencode-ai/sdk/dist/gen/types.gen.d.ts`

## Executive verdict

OpenCode plugin parity is split in 2 layers:

- high-signal product telemetry parity: **roughly 80% achievable**
- full Claude backend parity: **roughly 35% achievable**

Reason:

- plugin API exposes enough hooks/events for prompt, tool, permission, command, session, diff, file, error, token, and cost signals
- plugin API does **not** expose Claude-internal trust state, org opt-out checks, first-party flags, device/account identity, remote config, or built-in exporter internals

So:

- **Claude-compatible high-signal payloads**: good target
- **Anthropic-internal full payload parity**: not realistic without core/runtime changes
- repo target should still be **Claude payload compatibility first**, with explicit gap docs where parity is impossible
- delivery should remain split across **1P**, **2P**, and **3P** channels, but **3P** is unsupported for now

## Parity matrix

| area | Claude spec | OpenCode plugin parity | notes |
| --- | --- | --- | --- |
| user prompt events/logs | `tengu_input_prompt`, `claude_code.user_prompt` | high | plugin surface exposes enough prompt/session/model context; current repo emits both |
| tool lifecycle | `tengu_tool_use_*`, `claude_code.tool_result` | medium-high | success path is strong; current repo does not emit first-party tool error yet |
| permission decision metrics | `claude_code.code_edit_tool.decision` | high | `permission.ask` gives decision result; source attribution still partial |
| command/git operation events | `tengu_input_command`, git op tracking | medium-high | `command.execute.before` + `event.command.executed`; current repo derives commit/PR metrics heuristically, failure detail still thin |
| token/cost/API usage | `claude_code.token.usage`, `cost.usage`, `api_*` | medium-high | `event.message.updated` assistant msg has `cost`, `tokens`, success/error info; request attempt/provider transport detail still partial |
| session/activity metrics | `session.count`, `active_time.total` | medium | session count is easy; current repo records active time only from command duration, not full user activity |
| diff/LoC metrics | `lines_of_code.count` | medium-high | `session.diff` exposes enough totals; current repo emits added/removed metrics |
| HTTP batching/retry | 1P batch retry/backoff | high | implemented with bounded retry/backoff |
| disk queue + startup replay | failed batch durability | medium-high | implemented via durable queue wrapper + replay handshake |
| Segment/Datadog side channels | side-channel forwarding | low | intentionally unsupported for now |
| OTEL metrics/logs | 2P reporting path | medium-high | current repo emits Claude-compatible OTEL-style JSON envelopes, not native SDK exporter |
| OTEL traces | model/tool traces | low | no trace/span lifecycle hooks for Claude-equivalent tracing |
| org/trust/identity enrichment | org opt-out, trust, identity enrichment | low | plugin API does not expose these values |
| remote config / feature flags / killswitch | GrowthBook, firstParty, sampling config | low | not exposed; must build separate config system |
| auth fallback semantics | OAuth/API key fallback, auth-less retry on 401 | low | plugin controls its own sink only, not OpenCode core auth behavior |

## What is fully or near-fully achievable

### 1) Event telemetry pipeline

Using plugin hooks + SDK events, an OpenCode plugin can capture most high-signal runtime events:

- prompt intake: `chat.message`
- tool start/end: `tool.execute.before`, `tool.execute.after`
- permission outcome: `permission.ask`
- command activity: `command.execute.before`, `event.command.executed`
- diff/file changes: `session.diff`, message/session diff summaries
- runtime errors: assistant message error fields

This is enough to recreate a solid high-signal `tengu_*`-style event stream. In this repo, Claude-compatible names and envelopes are already treated as the primary external contract for covered paths.

### 2) Usage/cost telemetry

`event.message.updated` carries assistant message data with:

- `cost`
- `tokens.input`
- `tokens.output`
- `tokens.cache.read`
- `tokens.cache.write`
- `providerID`
- `modelID`
- `error.statusCode?`

So a plugin can rebuild:

- token usage metrics
- cost usage metrics
- API success/error events

Limit:

- Claude-specific request attrs like `attempt`, `speed`, exact provider transport details are not guaranteed by plugin hooks.

### 3) Delivery side

An OpenCode plugin can implement its own:

- HTTP batch sink
- retry/backoff
- disk queue
- startup replay
- multi-sink fanout
- OTEL/Segment/Datadog exporters

This means transport parity is mostly an engineering task, not an API limitation.

Current repo status on delivery:

- implemented: first-party batch envelope, 401 retry without auth on second attempt, disk-backed replay, fanout, channel-aware config, second-party OTEL-style JSON output
- not implemented: dedicated Segment adapter, dedicated Datadog adapter, trace exporter

## What stays partial

### 1) Commit / PR parity

Claude tracks successful git operations as metrics/events.

OpenCode plugin can get close via:

- `command.execute.before` for intent
- `event.command.executed` for completed command events
- optional PTY/session events for extra correlation

But exact parity is blocked by missing direct fields for:

- command exit code on normal command hook path
- exact command duration
- canonical success/failure outcome for every execution path

Practical result:

- good commit/PR telemetry is possible
- exact Claude-style commit/PR metric semantics are only approximate

### 2) Active time

Claude has explicit `active_time.total` logic.

OpenCode exposes enough for approximation:

- prompt/command timing
- message lifecycle timing

But there is no single canonical "active time" source in plugin API, so parity is behavioral, not exact. Current repo only records CLI-active time from command duration, not full user-active time.

### 3) OTEL parity

OpenCode plugin can emit custom OTEL logs/metrics.

It cannot exactly match Claude's built-in OTEL behavior because:

- resource attrs are not all available
- built-in export intervals/readers are not exposed
- trace/span lifecycle around core model execution is not exposed

## What is effectively impossible from plugin-only surface

### 1) Anthropic-internal gates and policy logic

Not exposed in plugin API:

- org metrics opt-out API result
- trusted workspace state
- first-party deployment state
- remote config keys like `tengu_1p_event_batch_config`
- GrowthBook experiment / killswitch state
- Anthropic account/org/device identity bundle

Without these, exact Claude send/skip decisions cannot be reproduced.

### 2) Claude-owned payload enrichment

Claude 1P payload includes identity-rich and environment-rich fields that are not exposed through the plugin surface.

Plugin API exposes project/directory/worktree/config and some message/runtime context, but not this identity/auth bundle.

### 3) Claude-owned auth fallback behavior

Claude can retry 1P event logging without auth on `401` depending on trust/config.

Plugin can implement similar logic for its own sink, but not parity with Claude core auth/exporter behavior.

## Current repo vs max achievable parity

Current repo now covers most realistic first-pass parity wins:

- shared Claude-compatible event and metric contracts
- hook mapping for prompt/API usage/API error/permission/command/git/tool/diff
- HTTP sink with retry/backoff
- buffered publish/flush
- disk queue + startup replay
- fanout sink
- Claude-compatible OTEL-style JSON export
- channel-aware config/schema for `firstParty` / `secondParty` / `thirdParty`

Current repo still does **not** cover the biggest remaining parity wins:

- first-party tool error event emission
- first-party slash/bash/startup/git-operation event coverage
- dedicated Datadog payload formatting
- dedicated Segment payload formatting
- stronger command success/failure semantics beyond coarse event correlation
- session lifecycle and file lifecycle hook mapping
- user-active-time derivation beyond command duration
- native OTEL SDK/exporter integration if exact 3P stack parity is desired

So current implementation is now **meaningfully closer to realistic plugin parity** and already uses Claude-compatible names for covered outputs, but strict end-to-end parity is still partial. Rough estimate today: **70-80% of the realistic plugin ceiling** for high-signal telemetry, lower for strict payload identity and Claude-internal behavior.

## Best realistic target

If the goal is "feature parity that matters operationally", target this set:

1. event stream parity for prompt/tool/permission/command/session
2. token/cost/API metrics from assistant message events
3. diff/LoC metrics from session diff events
4. durable HTTP batching with replay
5. optional OTEL + warehouse-friendly sink output layered after Claude-compatible capture
6. independent enable/disable control for first-party, second-party, and third-party delivery

That gets close to Claude's useful telemetry outcomes without pretending to match Anthropic-internal policy behavior.

## Recommended conclusion

Use this rule:

- aim for **Claude-compatible payloads** wherever OpenCode surface exposes enough data
- document every field/decision path that stays approximate due to plugin API limits
- do **not** claim exact parity on Anthropic-internal exporters, gates, or identity-rich payloads

Short version:

- **yes**: OpenCode plugin can become a serious Claude-compat telemetry implementation
- **no**: it cannot exactly replicate Claude Code's full telemetry stack from plugin-only APIs
