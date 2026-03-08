# Claude Telemetry Portable Map (Public-Safe)

This file is the public-safe portable map derived from local reverse-engineering notes.

Full derivation notes stay local and are not tracked.

## Channel categories

Portable telemetry design needs to separate these logical channels:

- OTEL-compatible metrics
- OTEL-compatible logs/events
- internal vendor metrics/events
- side-channel forwarding such as analytics or log platforms

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

- build behaviorally equivalent events, not vendor-identical envelopes
- prefer normalized attrs over copied internal payload structure
- keep secrets and identity out of default public examples
- route by provider/model when needed, but keep routing config user-controlled

## Repo implications

This repo currently implements:

- prompt, tool, API, command, git, file, diff, and session telemetry
- HTTP sink with retry/backoff
- durable queue + startup replay
- fanout sink
- OTEL-style normalized JSON sink
- XDG JSONC routing config
