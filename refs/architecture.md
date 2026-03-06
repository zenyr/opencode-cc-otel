# Architecture

This repository is a Bun + Turbo monorepo organized with a hexagonal architecture.

## Structure

- `packages/domain`: core domain model and business rules
- `packages/application`: use-cases and application services
- `packages/adapters`: external integrations (I/O boundaries)
- `packages/main`: plugin entrypoint and composition root for deployment (`opencode-cc-telemetry`)

## Notes

- Package boundaries follow ports-and-adapters principles.
- The deploy target is a single package: `packages/main`.
- `packages/domain` owns event names, attr normalization, and input validation.
- `packages/application` owns buffering and explicit flush behavior.
- `packages/adapters` owns sink implementations and transport policy: retry/backoff, durability, fanout, normalized OTEL JSON envelopes.
- `packages/main` only maps OpenCode hooks + env config into the app layer.

## Current composition

- domain events cover prompt, API usage/error, tool lifecycle, command/git ops, file edits, session lifecycle, and diff summaries.
- application service batches in memory with explicit `flush()` and safe default `maxBatchSize=1`.
- adapter stack can compose HTTP sink + optional console mirroring + optional durable queue replay.
- OTEL-style export is implemented as portable JSON envelopes, not native OpenTelemetry SDK wiring.
