# Telemetry Config Model

This doc is the SSOT for telemetry config terms and channel routing in this repo.

## Goal

- keep config language stable across refs, schema, README, and web docs
- separate payload semantics from delivery medium
- keep first-party, second-party, and third-party as independent channel controls
- define current state vs target direction without mixing them

## Channel model

- `firstParty`: Anthropic-owned / Claude official reporting
- `secondParty`: team-owned reporting path; core repo focus
- `thirdParty`: vendor-owned forwarding such as Datadog, Segment, or warehouse sinks; unsupported for now

Each channel is independent.

- one channel can be on while another stays off
- one channel can fail without redefining another channel's contract
- channel names describe ownership and reporting intent, not the wire protocol alone

## Terms

Use these terms consistently.

### channel

Logical reporting lane defined by ownership and product intent.

Examples:

- `firstParty`
- `secondParty`
- `thirdParty`

### sink

Payload/export contract for a channel.

Use `sink` for questions like:

- what envelope shape is emitted?
- what downstream contract is expected?
- what reporting system semantics are targeted?

Examples:

- `http` for Anthropic 1P batch payloads
- `otel-json` for Claude-style 2P OTEL JSON logs and metrics
- `otlp-json` for official OTLP JSON export payloads

### transport

Delivery medium used by a sink.

Use `transport` for questions like:

- where is payload written?
- how does it leave the process?
- what operational failure mode applies?

Examples:

- `file`
- `stdout`
- `stderr`
- `http`
- `memory`
- `unix-socket`
- `browser-bridge`

## Naming rules

- do not use `mode` for channel config docs
- do not mix sink names with transport names in the same enum unless the design explicitly models that compromise
- if a value answers "what format/contract?", call it a sink
- if a value answers "where/how delivered?", call it a transport

## Current repo state

Current public config supports:

- `channels.firstParty.sink = "http"`
- `channels.secondParty.sink = "otel-json" | "otlp-json"`
- `channels.secondParty.transport = "file" | "console" | "http"`
- `channels.thirdParty.enabled = false` only

Current implementation:

- 2P sink and transport are now separate config fields
- 2P local default is `otel-json` over file transport
- file transport writes append-only NDJSON
- console remains available as an explicit transport
- HTTP transport can carry either Claude-style `otel-json` compatibility output in future or official `otlp-json` export payloads; current OTLP path is `sink = "otlp-json"` over HTTP

## Preferred direction

Current model and target model are aligned here:

- `sink` describes payload/export contract
- `transport` describes delivery medium

Target examples:

- `firstParty.sink = "http"`
- `firstParty.transport = "http"`
- `secondParty.sink = "otel-json"`
- `secondParty.sink = "otlp-json"`
- `secondParty.transport = "file"`
- `secondParty.transport = "http"`

For 2P local development, preferred default is:

- sink: `otel-json`
- sink: `otlp-json`
- transport: `file`
- file format: newline-delimited JSON (`ndjson`)

Rationale:

- does not corrupt TUI output
- works better than console output in web-hosted or embedded UI surfaces
- can be tailed, replayed, parsed, and shipped with standard tooling
- keeps OTEL-style payload generation separate from destination concerns

## Console policy

- treat console delivery as debug-only
- do not document console as the primary 2P path
- do not recommend console output for TUI-integrated or web-integrated surfaces
- when console exists in config/runtime, describe it as a compatibility or temporary local inspect path

## NDJSON guidance

When 2P uses file transport:

- one JSON object per line
- append-only writes
- stable UTF-8 text file
- downstream tools can use `tail`, `jq`, shippers, or collectors

Recommended use cases:

- local inspection
- bug reproduction
- CI artifact capture
- sidecar or collector pickup

## Claude policy sources

Second-party config can also be hydrated from Claude-managed settings sources when present:

- `CLAUDE_CONFIG_DIR/remote-settings.json` or `~/.claude/remote-settings.json`
- macOS managed settings: `/Library/Application Support/ClaudeCode/managed-settings.json`

Repo runtime normalizes supported telemetry fields from those files into the repo config model.

## Derivation rules

- `refs/` docs define semantics
- schema defines the machine-valid config contract for the current implementation
- `README.md` is a short derived summary
- web docs are a derived presentation layer and must not invent alternate terminology

If derived docs conflict with this file, this file wins.
