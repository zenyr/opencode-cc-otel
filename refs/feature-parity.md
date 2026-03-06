# OpenCode Plugin Feature Parity Assessment

## Goal

Assess how close an OpenCode plugin can get to Claude Code telemetry behavior using the public plugin API in `@opencode-ai/plugin@1.2.20`.

Scope:

- source refs: `refs/metrics-to-anthropic.md`, `refs/docs/claude/telemetry-portable.md`
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

- **operator-facing telemetry parity**: good target
- **Anthropic-internal telemetry parity**: not realistic without core/runtime changes

## Parity matrix

| area | Claude spec | OpenCode plugin parity | notes |
| --- | --- | --- | --- |
| user prompt events/logs | `tengu_input_prompt`, `claude_code.user_prompt` | high | `chat.message`, `tui.prompt.append`, `event.message.updated` give enough prompt/session context |
| tool lifecycle | `tengu_tool_use_*`, `claude_code.tool_result` | high | `tool.execute.before/after`, permission hooks, metadata file path, output title available |
| permission decision metrics | `claude_code.code_edit_tool.decision` | high | `permission.ask` gives decision result; source attribution still partial |
| command/git operation events | `tengu_input_command`, git op tracking | medium-high | `command.execute.before` + `event.command.executed`; commit/PR success approximation now implemented, failure detail still thin |
| token/cost/API usage | `claude_code.token.usage`, `cost.usage`, `api_*` | medium-high | `event.message.updated` assistant msg has `cost`, `tokens`, success/error info; request attempt/provider transport detail still partial |
| session/activity metrics | `session.count`, `active_time.total` | medium-high | `session.created`, `session.idle`, `session.status`, `session.error` now covered; active time still approximate |
| diff/LoC metrics | `lines_of_code.count` | medium-high | `session.diff`, message/session summaries expose file diffs/additions/deletions |
| HTTP batching/retry | 1P batch retry/backoff | high | implemented with bounded retry/backoff |
| disk queue + startup replay | failed batch durability | medium-high | implemented via durable queue wrapper + replay handshake |
| Segment/Datadog side channels | side-channel forwarding | medium-high | fanout path exists; dedicated Datadog/Segment payloads still pending |
| OTEL metrics/logs | 3P exporter paths | medium-high | implemented as normalized OTEL-like JSON envelope, not native SDK exporter |
| OTEL traces | model/tool traces | low | no trace/span lifecycle hooks for Claude-equivalent tracing |
| org/trust/identity enrichment | org opt-out, trust, device/account/email | low | plugin API does not expose these values |
| remote config / feature flags / killswitch | GrowthBook, firstParty, sampling config | low | not exposed; must build separate config system |
| auth fallback semantics | OAuth/API key fallback, auth-less retry on 401 | low | plugin controls its own sink only, not OpenCode core auth behavior |

## What is fully or near-fully achievable

### 1) Event telemetry pipeline

Using plugin hooks + SDK events, an OpenCode plugin can capture most high-signal runtime events:

- prompt intake: `chat.message`, `tui.prompt.append`
- tool start/end: `tool.execute.before`, `tool.execute.after`
- permission outcome: `permission.ask`
- command activity: `command.execute.before`, `event.command.executed`
- session lifecycle: `session.created`, `session.updated`, `session.deleted`, `session.idle`, `session.status`
- diff/file changes: `session.diff`, `file.edited`, message/session diff summaries
- runtime errors: `session.error`, assistant message error fields

This is enough to recreate a solid `tengu_*`-style event stream, even if event names and envelopes differ.

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

- `session.status`
- `session.idle`
- TUI prompt/command events
- message lifecycle timing

But there is no single canonical "active time" source in plugin API, so parity is behavioral, not exact.

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

Claude 1P payload includes values like:

- `device identifier`
- `email`
- `auth`
- `organization identity field`
- `user.account_uuid`
- detailed env/process bundle

Plugin API exposes project/directory/worktree/config and some message/runtime context, but not this identity/auth bundle.

### 3) Claude-owned auth fallback behavior

Claude can retry 1P event logging without auth on `401` depending on trust/config.

Plugin can implement similar logic for its own sink, but not parity with Claude core auth/exporter behavior.

## Current repo vs max achievable parity

Current repo now covers most realistic first-pass parity wins:

- shared event contracts
- hook mapping for prompt/API usage/API error/permission/command/git/session/file/tool
- HTTP sink with retry/backoff
- buffered publish/flush
- disk queue + startup replay
- fanout sink
- normalized OTEL JSON export

Current repo still does **not** cover the biggest remaining parity wins:

- dedicated Datadog payload formatting
- dedicated Segment payload formatting
- stronger command success/failure semantics beyond coarse event correlation
- session active-time derivation
- native OTEL SDK/exporter integration if exact 3P stack parity is desired

So current implementation is now **meaningfully closer to realistic plugin parity**. Rough estimate today: **60-70% of the realistic plugin ceiling**.

## Best realistic target

If the goal is "feature parity that matters operationally", target this set:

1. event stream parity for prompt/tool/permission/command/session
2. token/cost/API metrics from assistant message events
3. diff/LoC metrics from session diff events
4. durable HTTP batching with replay
5. optional OTEL + warehouse-friendly normalized schema

That gets close to Claude's useful telemetry outcomes without pretending to match Anthropic-internal policy behavior.

## Recommended conclusion

Use this rule:

- aim for **behavioral parity** on product telemetry
- do **not** aim for exact parity on Anthropic-internal exporters, gates, or identity-rich payloads

Short version:

- **yes**: OpenCode plugin can become a serious telemetry implementation
- **no**: it cannot exactly replicate Claude Code's full telemetry stack from plugin-only APIs
