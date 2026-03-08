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

## Channel priority

- first-party: Anthropic-owned / Claude official endpoint reporting
- second-party: OTEL reporting for team and enterprise usage
- third-party: Datadog, warehouse, analytics, or other vendor-owned reporting, unsupported for now
- second-party OTEL is the core package goal
- first-party and second-party should be independently trackable and independently on/off

## Behavior inferred from analysis

- telemetry is split across multiple channels, not one sink
- metrics and event logging have separate gating logic
- prompt/tool/API/session/git activity are the most useful parity targets
- some channels use batching, retry, queue replay, and exporter-specific policies
- some internal-only enrichments exist but are not required for practical parity

## Portable implementation implications

- treat Claude payload fields and event names as primary contract when exposed by OpenCode hooks
- avoid introducing repo-local event names as external contract unless used only as temporary internal translation
- keep first-party, second-party, and third-party delivery as separate channel controls, not one global sink switch
- model prompt intake as first-class telemetry
- record tool lifecycle with duration and file/language metadata when available
- record API usage and API error separately
- record command execution and detect successful commit/PR creation heuristically
- aggregate diff/file activity into simple portable attrs
- support buffered HTTP publish, retry/backoff, and durable replay
- expose OTEL-friendly sink output as a downstream adapter, not as replacement for Claude-compatible capture

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
- diff summaries and derived metrics
- buffered HTTP, durability, and Claude-compatible OTEL-style JSON export

Current implementation still diverges from target in one major way:

- identity/trust/org enrichment still cannot fully match Claude raw payload schema from plugin-only APIs

Remaining work should focus on public-safe parity gaps only.
