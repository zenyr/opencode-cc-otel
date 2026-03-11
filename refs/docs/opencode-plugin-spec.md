# OpenCode Plugin: Tool-Call Payload Spec

## Overview

Official behavior for modifying tool-call payloads in OpenCode plugins.

## Core Hooks

- `permission.ask`: decide allow/deny/ask before tool exec
- `tool.execute.before`: modify actual tool args payload
- `tool.execute.after`: post-process exec result
- `tool.definition`: modify tool description/parameters exposed to model

## Key Point

Plugins can do more than block tool calls. `tool.execute.before` can rewrite payloads.

Hooks mutate the `output` object directly, not by returning a replacement value:

```ts
import type { Plugin } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        output.args.command = output.args.command.replace(
          "rm -rf",
          "echo blocked:",
        );
      }
    },
  };
};
```

## Behavior

1. OpenCode calls `Plugin.trigger("tool.execute.before", ..., { args })` right before tool exec.
2. Mutated `output.args` is used for the actual tool exec.
3. Payload rewrite is an officially supported behavior.

## Notes

- mutate fields directly, ex: `output.args.x = ...`
- modified args must still pass later tool schema validation
- `tool.definition` changes model-facing description/schema, not runtime payload

## Reference Sources

- docs: `packages/web/src/content/docs/ko/plugins.mdx`
- hook types: `packages/plugin/src/index.ts`
- execution path: `packages/opencode/src/session/prompt.ts`
- hook dispatcher: `packages/opencode/src/plugin/index.ts`
- tool schema rewrite: `packages/opencode/src/tool/registry.ts`
