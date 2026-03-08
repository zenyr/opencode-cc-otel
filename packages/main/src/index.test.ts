import { expect, test } from "bun:test";

import type { PluginInput } from "@opencode-ai/plugin";
import { InMemoryTelemetrySink } from "@zenyr/telemetry-adapters";
import { TELEMETRY_EVENT_NAMES } from "@zenyr/telemetry-domain";
import {
  createOpencodeHooks,
  createTelemetrySinkFromEnv,
  loadTelemetryConfig,
  parseJsoncObject,
} from "./index";

class ReplayableInMemorySink extends InMemoryTelemetrySink {
  replayed = false;

  async flushQueued(): Promise<void> {
    this.replayed = true;
  }
}

type ChatMessageInput = Parameters<
  NonNullable<ReturnType<typeof createOpencodeHooks>["chat.message"]>
>[0];
type ChatMessageOutput = Parameters<
  NonNullable<ReturnType<typeof createOpencodeHooks>["chat.message"]>
>[1];
type EventInput = Parameters<
  NonNullable<ReturnType<typeof createOpencodeHooks>["event"]>
>[0];
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
    type: "Edit",
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

const buildChatMessageInput = (): ChatMessageInput => {
  return {
    sessionID: "session-1",
    agent: "build",
    model: {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    },
    messageID: "message-1",
    variant: "chat",
  };
};

const buildChatMessageOutput = (): ChatMessageOutput => {
  return {
    message: {
      id: "message-1",
      sessionID: "session-1",
      role: "user",
      time: {
        created: 1,
      },
      agent: "build",
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4-6",
      },
      tools: {},
    },
    parts: [
      {
        id: "part-1",
        sessionID: "session-1",
        messageID: "message-1",
        type: "text",
        text: "hello world",
      },
    ],
  };
};

const buildAssistantMessageUpdatedEvent = (): EventInput => {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id: "assistant-1",
          sessionID: "session-1",
          role: "assistant",
          time: {
            created: 5,
            completed: 15,
          },
          modelID: "claude-sonnet-4-6",
          providerID: "anthropic",
          cost: 0.25,
          tokens: {
            input: 10,
            output: 20,
            reasoning: 0,
            cache: {
              read: 3,
              write: 4,
            },
          },
        },
      },
    },
  } as EventInput;
};

const buildAssistantErrorUpdatedEvent = (): EventInput => {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id: "assistant-2",
          sessionID: "session-1",
          role: "assistant",
          time: {
            created: 5,
            completed: 15,
          },
          modelID: "claude-sonnet-4-6",
          providerID: "anthropic",
          parentID: "message-1",
          mode: "build",
          path: {
            cwd: "/tmp/project",
            root: "/tmp/project",
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0,
            },
          },
          error: {
            name: "ApiError",
            data: {
              message: "bad gateway",
              statusCode: 502,
            },
          },
        },
      },
    },
  } as unknown as EventInput;
};

const createScriptedClock = (...values: number[]) => {
  let index = 0;
  return {
    nowMs: () => {
      const value =
        values[index] ??
        (values.length === 0 ? 0 : (values[values.length - 1] ?? 0));
      index += 1;
      return value;
    },
  };
};

test("parseJsoncObject parses JSONC without stripping URLs", () => {
  expect(
    parseJsoncObject<{
      channels: {
        firstParty: { sink: string; http: { default: { endpoint: string } } };
      };
    }>(`{
      // top comment
      "channels": {
        "firstParty": {
          "sink": "http",
          "http": {
            "default": {
              "endpoint": "https://telemetry.example.test/default" /* inline */
            }
          }
        }
      }
    }`),
  ).toEqual({
    channels: {
      firstParty: {
        sink: "http",
        http: {
          default: {
            endpoint: "https://telemetry.example.test/default",
          },
        },
      },
    },
  });
});

test("loadTelemetryConfig reads channel-aware JSONC config", async () => {
  const configPath = `/tmp/opencode-telemetry-channels-${Date.now()}.jsonc`;

  await Bun.write(
    configPath,
    `{
      "channels": {
        "firstParty": {
          "enabled": true,
          "sink": "http",
          "http": {
            "default": {
              "endpoint": "https://telemetry.example.test/anthropic"
            }
          }
        },
        "secondParty": {
          "enabled": true,
          "sink": "otel-json",
          "otel": {
            "logsChannelId": "otel_3p_logs",
            "metricsChannelId": "otel_3p_metrics"
          }
        },
        "thirdParty": {
          "enabled": false
        }
      }
    }`,
  );

  expect(
    loadTelemetryConfig({
      OPENCODE_TELEMETRY_CONFIG_PATH: configPath,
    }),
  ).toEqual({
    channels: {
      firstParty: {
        enabled: true,
        sink: "http",
        http: {
          default: {
            endpoint: "https://telemetry.example.test/anthropic",
          },
        },
      },
      secondParty: {
        enabled: true,
        sink: "otel-json",
        otel: {
          logsChannelId: "otel_3p_logs",
          metricsChannelId: "otel_3p_metrics",
        },
      },
      thirdParty: {
        enabled: false,
      },
    },
  });
});

test("createTelemetrySinkFromEnv builds fanout sink from 1P and 2P", async () => {
  const configPath = `/tmp/opencode-telemetry-fanout-${Date.now()}.jsonc`;

  await Bun.write(
    configPath,
    `{
      "channels": {
        "firstParty": {
          "enabled": true,
          "sink": "http",
          "http": {
            "default": {
              "endpoint": "https://telemetry.example.test/anthropic"
            }
          }
        },
        "secondParty": {
          "enabled": true,
          "sink": "otel-json"
        },
        "thirdParty": {
          "enabled": false
        }
      }
    }`,
  );

  const sink = createTelemetrySinkFromEnv({
    OPENCODE_TELEMETRY_CONFIG_PATH: configPath,
  });

  expect(sink.constructor.name).toBe("FanoutTelemetrySink");
});

test("createTelemetrySinkFromEnv rejects enabled thirdParty", async () => {
  const configPath = `/tmp/opencode-telemetry-third-party-${Date.now()}.jsonc`;

  await Bun.write(
    configPath,
    `{
      "channels": {
        "thirdParty": {
          "enabled": true
        }
      }
    }`,
  );

  expect(() => {
    createTelemetrySinkFromEnv({
      OPENCODE_TELEMETRY_CONFIG_PATH: configPath,
    });
  }).toThrow("thirdParty telemetry unsupported yet");
});

test("hook startup awaits queued replay before recording", async () => {
  const sink = new ReplayableInMemorySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 1,
    },
  });

  await hooks["permission.ask"]?.(buildPermissionInput(), {
    status: "allow",
  });

  expect(sink.replayed).toBeTrue();
  expect(sink.drain()).toHaveLength(2);
});

test("chat.message emits 1P and 2P prompt events", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 2),
  });

  await hooks["chat.message"]?.(
    buildChatMessageInput(),
    buildChatMessageOutput(),
  );

  expect(sink.drain()).toEqual([
    {
      kind: "event",
      channel: "firstParty",
      name: TELEMETRY_EVENT_NAMES.firstParty.inputPrompt,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        promptLength: 11,
        model: "claude-sonnet-4-6",
        provider: "anthropic",
      },
    },
    {
      kind: "event",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondParty.userPrompt,
      timestamp: "1970-01-01T00:00:00.002Z",
      sessionId: "session-1",
      attributes: {
        "prompt.id": "message-1",
        prompt_length: 11,
        model: "claude-sonnet-4-6",
        provider: "anthropic",
      },
    },
  ]);
});

test("permission.ask emits 2P tool decision event and metric", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 2),
  });

  await hooks["permission.ask"]?.(buildPermissionInput(), {
    status: "allow",
  });

  expect(sink.drain()).toEqual([
    {
      kind: "event",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondParty.toolDecision,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        tool_name: "Edit",
        decision: "accept",
        source: "unknown",
      },
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.codeEditToolDecision,
      timestamp: "1970-01-01T00:00:00.002Z",
      sessionId: "session-1",
      attributes: {
        decision: "accept",
        source: "unknown",
        tool_name: "Edit",
      },
      unit: "{count}",
      value: 1,
      description: undefined,
    },
  ]);
});

test("tool hooks emit 1P and 2P tool telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 8, 9),
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
      kind: "event",
      channel: "firstParty",
      name: TELEMETRY_EVENT_NAMES.firstParty.toolUseSuccess,
      timestamp: "1970-01-01T00:00:00.009Z",
      sessionId: "session-1",
      attributes: {
        toolName: "edit",
        durationMs: 7,
        toolResultSizeBytes: 2,
        fileExtension: "typescript",
      },
    },
    {
      kind: "event",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondParty.toolResult,
      timestamp: "1970-01-01T00:00:00.009Z",
      sessionId: "session-1",
      attributes: {
        tool_name: "edit",
        success: true,
        duration_ms: 7,
        tool_result_size_bytes: 2,
        file_path: "src/main.ts",
        language: "typescript",
      },
    },
  ]);
});

test("message.updated success emits 1P, 2P, cost, and token metrics", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 2, 3, 4, 5, 6, 7),
  });

  await hooks.event?.(buildAssistantMessageUpdatedEvent());

  expect(sink.drain()).toEqual([
    {
      kind: "event",
      channel: "firstParty",
      name: TELEMETRY_EVENT_NAMES.firstParty.apiSuccess,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        durationMs: 10,
        inputTokens: 10,
        outputTokens: 20,
        cachedInputTokens: 3,
        cacheCreationTokens: 4,
        costUSD: 0.25,
      },
    },
    {
      kind: "event",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondParty.apiRequest,
      timestamp: "1970-01-01T00:00:00.002Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        duration_ms: 10,
        input_tokens: 10,
        output_tokens: 20,
        cache_read_tokens: 3,
        cache_creation_tokens: 4,
        cost_usd: 0.25,
      },
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.costUsage,
      timestamp: "1970-01-01T00:00:00.003Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
      },
      unit: "USD",
      value: 0.25,
      description: undefined,
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      timestamp: "1970-01-01T00:00:00.004Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        type: "input",
      },
      unit: "tokens",
      value: 10,
      description: undefined,
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      timestamp: "1970-01-01T00:00:00.005Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        type: "output",
      },
      unit: "tokens",
      value: 20,
      description: undefined,
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      timestamp: "1970-01-01T00:00:00.006Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        type: "cacheRead",
      },
      unit: "tokens",
      value: 3,
      description: undefined,
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      timestamp: "1970-01-01T00:00:00.007Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        type: "cacheCreation",
      },
      unit: "tokens",
      value: 4,
      description: undefined,
    },
  ]);
});

test("message.updated error emits 1P and 2P error events", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 2),
  });

  await hooks.event?.(buildAssistantErrorUpdatedEvent());

  expect(sink.drain()).toEqual([
    {
      kind: "event",
      channel: "firstParty",
      name: TELEMETRY_EVENT_NAMES.firstParty.apiError,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        durationMs: 10,
        error: "bad gateway",
        status: 502,
      },
    },
    {
      kind: "event",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondParty.apiError,
      timestamp: "1970-01-01T00:00:00.002Z",
      sessionId: "session-1",
      attributes: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        duration_ms: 10,
        error: "bad gateway",
        status_code: 502,
      },
    },
  ]);
});

test("session.diff emits second-party lines-of-code metrics", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 2),
  });

  await hooks.event?.({
    event: {
      type: "session.diff",
      properties: {
        sessionID: "session-1",
        diff: [
          {
            file: "src/main.ts",
            additions: 5,
            deletions: 3,
            before: "",
            after: "",
          },
        ],
      },
    },
  } as EventInput);

  expect(sink.drain()).toEqual([
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.linesOfCodeCount,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        type: "added",
      },
      unit: "{count}",
      value: 5,
      description: undefined,
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.linesOfCodeCount,
      timestamp: "1970-01-01T00:00:00.002Z",
      sessionId: "session-1",
      attributes: {
        type: "removed",
      },
      unit: "{count}",
      value: 3,
      description: undefined,
    },
  ]);
});

test("command lifecycle emits first-party command event and second-party metrics", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: createScriptedClock(1, 5, 6, 7),
  });

  await hooks["command.execute.before"]?.(
    {
      sessionID: "session-1",
      command: "gh",
      arguments: "pr create",
    },
    {
      parts: [],
    },
  );

  await hooks.event?.({
    event: {
      type: "command.executed",
      properties: {
        sessionID: "session-1",
        name: "gh",
        arguments: "pr create",
        messageID: "message-1",
      },
    },
  } as EventInput);

  expect(sink.drain()).toEqual([
    {
      kind: "event",
      channel: "firstParty",
      name: TELEMETRY_EVENT_NAMES.firstParty.inputCommand,
      timestamp: "1970-01-01T00:00:00.006Z",
      sessionId: "session-1",
      attributes: {
        input: "gh pr create",
      },
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.pullRequestCount,
      timestamp: "1970-01-01T00:00:00.007Z",
      sessionId: "session-1",
      attributes: {},
      unit: "{count}",
      value: 1,
      description: undefined,
    },
    {
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.activeTimeTotal,
      timestamp: "1970-01-01T00:00:00.007Z",
      sessionId: "session-1",
      attributes: {
        type: "cli",
      },
      unit: "s",
      value: 0.004,
      description: undefined,
    },
  ]);
});
