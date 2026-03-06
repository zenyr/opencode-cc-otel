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
- `packages/adapters` owns sink implementations and transport retry policy.
- `packages/main` only maps OpenCode hooks + env config into the app layer.
