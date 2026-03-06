import { expect, test } from "bun:test";

import type { PluginInput } from "@opencode-ai/plugin";
import { InMemoryTelemetrySink } from "@zenyr/telemetry-adapters";
import { TELEMETRY_EVENT_NAMES } from "@zenyr/telemetry-domain";
import { createOpencodeHooks, createTelemetrySinkFromEnv } from "./index";

type PermissionInput = Parameters<
  NonNullable<ReturnType<typeof createOpencodeHooks>["permission.ask"]>
>[0];

const buildPluginInput = (): PluginInput => {
  return {
    directory: "/tmp/project",
    worktree: "/tmp/project",
  } as PluginInput;
};

const buildPermissionInput = (): PermissionInput => {
  return {
    id: "permission-1",
    type: "tool.execute",
    sessionID: "session-1",
    messageID: "message-1",
    title: "Tool execution",
    metadata: {
      permission: "tool.execute",
    },
    time: {
      created: 1,
    },
  };
};

const createScriptedClock = (...values: number[]) => {
  let index = 0;

  return {
    nowMs: () => {
      const value = values[Math.min(index, values.length - 1)] ?? 0;
      index += 1;
      return value;
    },
  };
};

test("createOpencodeHooks returns opencode hook handlers", () => {
  const hooks = createOpencodeHooks(buildPluginInput());

  expect(typeof hooks["tool.execute.before"]).toBe("function");
  expect(typeof hooks["tool.execute.after"]).toBe("function");
  expect(typeof hooks["permission.ask"]).toBe("function");
});

test("permission hook records shared telemetry event contract", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 1,
    },
  });

  await hooks["permission.ask"]?.(buildPermissionInput(), {
    status: "allow",
  });

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.permissionAsk,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        status: "allow",
        permission: "tool.execute",
      },
    },
  ]);
});

test("createTelemetrySinkFromEnv selects http sink from env", () => {
  const sink = createTelemetrySinkFromEnv({
    OPENCODE_TELEMETRY_SINK: "http",
    OPENCODE_TELEMETRY_HTTP_ENDPOINT: "https://telemetry.example.test/events",
  });

  expect(sink.constructor.name).toBe("HttpTelemetrySink");
});

test("tool hooks produce end-to-end telemetry payloads", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 1, 8, 8),
    env: {
      OPENCODE_TELEMETRY_MAX_BATCH_SIZE: "1",
    },
  });

  await hooks["tool.execute.before"]?.(
    {
      tool: "edit",
      sessionID: "session-1",
      callID: "call-1",
    },
    {
      args: {},
    },
  );

  await hooks["tool.execute.after"]?.(
    {
      tool: "edit",
      sessionID: "session-1",
      callID: "call-1",
      args: {},
    },
    {
      title: "Edit file",
      output: "ok",
      metadata: {
        filepath: "src/main.ts",
      },
    },
  );

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.toolExecuteBefore,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        tool: "edit",
        callId: "call-1",
        timestampSource: "hook",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
      timestamp: "1970-01-01T00:00:00.008Z",
      sessionId: "session-1",
      attributes: {
        tool: "edit",
        callId: "call-1",
        durationMs: 7,
        filePath: "src/main.ts",
        language: "typescript",
        timestampSource: "hook",
        title: "Edit file",
      },
    },
  ]);
});
