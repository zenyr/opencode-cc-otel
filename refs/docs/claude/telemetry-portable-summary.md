# Claude Telemetry Portable Map (Public-Safe)

This file is the public-safe portable map derived from local reverse-engineering notes.

Full derivation notes stay local and are not tracked.

## Channel categories

Portable telemetry design needs to separate these logical channels:

- first-party reporting to Anthropic-owned / Claude official endpoints
- second-party OTEL reporting for team and enterprise usage
- third-party forwarding such as Datadog, analytics, or warehouse/log platforms, unsupported for now in this repo

Each channel should be independently trackable and independently on/off.

## Portable event groups

### Prompt and command input

- user prompt
- shell/command invocation
- invalid slash or command handling

### Tool lifecycle

- tool decision
- tool success
- tool error

### API lifecycle

- API request success
- API request error
- token and cost application

### Session lifecycle

- startup
- session created
- session idle / status
- session error

### Diff and file activity

- file edited
- diff summary
- lines changed summary

## Portable payload guidance

Recommended normalized attrs:

- `event.name`
- `event.timestamp`
- `event.sequence`
- `session.id`
- `provider`
- `model`
- `tool`
- `command`
- `durationMs`
- `costUsd`
- token counts
- success/error attrs

## Safe parity guidance

- preserve Claude payload shape and field names where OpenCode exposes enough source data
- use repo-local normalization only as an internal bridge, not as final external contract
- mark missing Claude fields explicitly when plugin API cannot provide them
- keep secrets and identity out of default public examples
- route by provider/model when needed, but keep routing config user-controlled
- keep config language strict: channel != sink != transport
- prefer 2P OTEL JSON over append-only NDJSON file transport for local delivery; console output is debug-only

## Repo implications

This repo currently implements:

- prompt, tool, API, command, git, file, diff, and session telemetry
- HTTP sink with retry/backoff
- durable queue + startup replay
- fanout sink
- OTEL-style normalized JSON sink
- XDG JSONC routing config

Current repo still does not implement:

- full Claude identity/trust/org enrichment
- third-party Datadog or Segment forwarding
