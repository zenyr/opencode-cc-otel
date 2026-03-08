# Claude Code Telemetry Notes (Public-Safe)

This note keeps only the public-safe conclusions needed for parity work.

Full reverse-engineering notes are kept locally and are excluded from git.

## Goal

- capture the metric families that matter for parity
- preserve implementation implications
- avoid publishing vendor-internal endpoints, auth flows, or raw internal payload docs

## High-signal metric families

- session count
- lines changed
- commit count
- pull request count
- token usage
- cost usage
- code edit tool decision
- active time

## High-signal event families

- user prompt
- command input
- tool success / tool error
- API success / API error
- startup / session lifecycle

## Behavior inferred from analysis

- telemetry is split across multiple channels, not one sink
- metrics and event logging have separate gating logic
- prompt/tool/API/session/git activity are the most useful parity targets
- some channels use batching, retry, queue replay, and exporter-specific policies
- some internal-only enrichments exist but are not required for practical parity

## Portable implementation implications

- model prompt intake as first-class telemetry
- record tool lifecycle with duration and file/language metadata when available
- record API usage and API error separately
- record command execution and detect successful commit/PR creation heuristically
- aggregate diff/file activity into simple portable attrs
- support buffered HTTP publish, retry/backoff, and durable replay
- expose an OTEL-friendly normalized envelope for downstream systems

## Non-goals for public docs

These were intentionally removed from the public version:

- vendor-internal or staging endpoints
- undocumented auth fallback details
- raw internal payload specimens
- sensitive identity field inventories
- internal config key names that are not needed for parity implementation

## Current repo mapping

Current implementation already covers:

- prompt telemetry
- tool lifecycle
- permission decisions
- API usage and error
- command and git operation telemetry
- session lifecycle and diff summaries
- buffered HTTP, fanout, durability, and OTEL-style JSON export

Remaining work should focus on public-safe parity gaps only.
