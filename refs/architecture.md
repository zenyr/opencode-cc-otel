# Architecture

This repository is a Bun + Turbo monorepo organized with a hexagonal architecture.

## Structure

- `packages/domain`: core domain model and business rules
- `packages/application`: use-cases and application services
- `packages/adapters`: external integrations (I/O boundaries)
- `packages/main`: plugin entrypoint and composition root for deployment (`opencode-cc-otel`)

## Notes

- Package boundaries follow ports-and-adapters principles.
- The deploy target is a single package: `packages/main`.
- `packages/domain` owns Claude-compatible 1P/2P event and metric contracts, attr validation, and input validation.
- `packages/application` owns buffering and explicit flush behavior.
- `packages/adapters` owns sink implementations and transport policy: retry/backoff, durability, fanout, OTEL JSON envelopes.
- `packages/main` only maps OpenCode hooks + env config into the app layer.
- Target direction is to make Claude-compatible payload schema the canonical contract and push any repo-local translation behind adapters or compatibility layers.
- Runtime composition keeps independent channel control for `firstParty` and `secondParty`; `thirdParty` is reserved but unsupported.

## Current composition

- domain events cover Claude-compatible prompt, API usage/error, tool lifecycle, command, and metric families.
- application service batches in memory with explicit `flush()` and safe default `maxBatchSize=1`.
- adapter stack can compose 1P HTTP batch sink + durable queue replay + 2P OTEL JSON sink.
- OTEL-style export is implemented as Claude-compatible log/metric JSON envelopes, not native OpenTelemetry SDK wiring.
- channel-aware JSONC config can compose enabled `firstParty` + `secondParty` delivery in parallel.

## Gap called out

- identity/trust/org enrichment still stays partial because plugin API does not expose full Claude internals.
- `thirdParty` forwarding is still unsupported.
