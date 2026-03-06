import { expect, test } from "bun:test";

import type { PluginInput } from "@opencode-ai/plugin";
import { InMemoryTelemetrySink } from "@zenyr/telemetry-adapters";
import { TELEMETRY_EVENT_NAMES } from "@zenyr/telemetry-domain";
import { createOpencodeHooks, createTelemetrySinkFromEnv } from "./index";

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
          parentID: "message-1",
          modelID: "claude-sonnet-4-6",
          providerID: "anthropic",
          mode: "build",
          path: {
            cwd: "/tmp/project",
            root: "/tmp/project",
          },
          cost: 0.25,
          tokens: {
            input: 100,
            output: 40,
            reasoning: 10,
            cache: {
              read: 3,
              write: 2,
            },
          },
        },
      },
    },
  };
};

const buildAssistantMessageErrorEvent = (): EventInput => {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id: "assistant-err-1",
          sessionID: "session-1",
          role: "assistant",
          time: {
            created: 10,
            completed: 18,
          },
          parentID: "message-1",
          modelID: "claude-sonnet-4-6",
          providerID: "anthropic",
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
            name: "APIError",
            data: {
              message: "quota exceeded",
              statusCode: 429,
              isRetryable: false,
            },
          },
        },
      },
    },
  };
};

const buildSessionDiffEvent = (): EventInput => {
  return {
    event: {
      type: "session.diff",
      properties: {
        sessionID: "session-1",
        diff: [
          {
            file: "src/main.ts",
            before: "",
            after: "",
            additions: 3,
            deletions: 1,
          },
          {
            file: "src/app.ts",
            before: "",
            after: "",
            additions: 4,
            deletions: 2,
          },
        ],
      },
    },
  };
};

const buildCommandExecutedEvent = (): EventInput => {
  return {
    event: {
      type: "command.executed",
      properties: {
        name: "ls",
        sessionID: "session-1",
        arguments: "-la",
        messageID: "message-2",
      },
    },
  };
};

const buildGitCommitExecutedEvent = (): EventInput => {
  return {
    event: {
      type: "command.executed",
      properties: {
        name: "git",
        sessionID: "session-1",
        arguments: "commit -m test",
        messageID: "message-2",
      },
    },
  };
};

const buildGitPrExecutedEvent = (): EventInput => {
  return {
    event: {
      type: "command.executed",
      properties: {
        name: "gh",
        sessionID: "session-1",
        arguments: "pr create --title test",
        messageID: "message-3",
      },
    },
  };
};

const buildFileEditedEvent = (): EventInput => {
  return {
    event: {
      type: "file.edited",
      properties: {
        file: "src/main.ts",
      },
    },
  };
};

const buildSessionCreatedEvent = (): EventInput => {
  return {
    event: {
      type: "session.created",
      properties: {
        info: {
          id: "session-1",
          projectID: "project-1",
          directory: "/tmp/project",
          title: "Telemetry session",
          version: "1",
          time: {
            created: 1,
            updated: 1,
          },
          summary: {
            additions: 4,
            deletions: 1,
            files: 2,
          },
        },
      },
    },
  };
};

const buildSessionIdleEvent = (): EventInput => {
  return {
    event: {
      type: "session.idle",
      properties: {
        sessionID: "session-1",
      },
    },
  };
};

const buildSessionErrorEvent = (): EventInput => {
  return {
    event: {
      type: "session.error",
      properties: {
        sessionID: "session-1",
        error: {
          name: "APIError",
          data: {
            message: "rate limited",
            statusCode: 429,
            isRetryable: true,
          },
        },
      },
    },
  };
};

const buildSessionStatusRetryEvent = (): EventInput => {
  return {
    event: {
      type: "session.status",
      properties: {
        sessionID: "session-1",
        status: {
          type: "retry",
          attempt: 2,
          message: "provider timeout",
          next: 1500,
        },
      },
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

  expect(typeof hooks["chat.message"]).toBe("function");
  expect(typeof hooks["tool.execute.before"]).toBe("function");
  expect(typeof hooks["tool.execute.after"]).toBe("function");
  expect(typeof hooks["permission.ask"]).toBe("function");
});

test("chat message hook records prompt telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 1,
    },
  });

  await hooks["chat.message"]?.(
    buildChatMessageInput(),
    buildChatMessageOutput(),
  );

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.chatMessage,
      timestamp: "1970-01-01T00:00:00.001Z",
      sessionId: "session-1",
      attributes: {
        agent: "build",
        messageId: "message-1",
        model: "claude-sonnet-4-6",
        promptLength: 11,
        provider: "anthropic",
        variant: "chat",
      },
    },
  ]);
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

test("createTelemetrySinkFromEnv selects otel json sink from env", () => {
  const sink = createTelemetrySinkFromEnv({
    OPENCODE_TELEMETRY_SINK: "otel-json",
  });

  expect(sink.constructor.name).toBe("OTelJsonSink");
});

test("createTelemetrySinkFromEnv wraps sink with durability when queue dir set", () => {
  const sink = createTelemetrySinkFromEnv({
    OPENCODE_TELEMETRY_QUEUE_DIR: "/tmp/opencode-cc-telemetry-queue",
  });

  expect(sink.constructor.name).toBe("DurableTelemetrySink");
});

test("createTelemetrySinkFromEnv wraps sink with fanout when mirror enabled", () => {
  const sink = createTelemetrySinkFromEnv({
    OPENCODE_TELEMETRY_HTTP_ENDPOINT: "https://telemetry.example.test/events",
    OPENCODE_TELEMETRY_MIRROR_CONSOLE: "1",
  });

  expect(sink.constructor.name).toBe("FanoutTelemetrySink");
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
  expect(sink.drain()).toHaveLength(1);
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

test("message.updated records API usage telemetry once per completion", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 20,
    },
  });

  const event = buildAssistantMessageUpdatedEvent();

  await hooks.event?.(event);
  await hooks.event?.(event);

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.020Z",
      attributes: {
        eventType: "message.updated",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.apiRequest,
      timestamp: "1970-01-01T00:00:00.020Z",
      sessionId: "session-1",
      attributes: {
        messageId: "assistant-1",
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        durationMs: 10,
        completedAtMs: 15,
        success: true,
        costUsd: 0.25,
        inputTokens: 100,
        outputTokens: 40,
        reasoningTokens: 10,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.020Z",
      attributes: {
        eventType: "message.updated",
      },
    },
  ]);
});

test("message.updated records API error telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 21,
    },
  });

  await hooks.event?.(buildAssistantMessageErrorEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.021Z",
      attributes: {
        eventType: "message.updated",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.apiError,
      timestamp: "1970-01-01T00:00:00.021Z",
      sessionId: "session-1",
      attributes: {
        messageId: "assistant-err-1",
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        durationMs: 8,
        completedAtMs: 18,
        success: false,
        errorName: "APIError",
        errorMessage: "quota exceeded",
        statusCode: 429,
      },
    },
  ]);
});

test("session.diff records aggregated diff telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 25,
    },
  });

  await hooks.event?.(buildSessionDiffEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.025Z",
      attributes: {
        eventType: "session.diff",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.sessionDiff,
      timestamp: "1970-01-01T00:00:00.025Z",
      sessionId: "session-1",
      attributes: {
        additions: 7,
        deletions: 3,
        files: 2,
      },
    },
  ]);
});

test("command.executed records completed command telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 30,
    },
  });

  await hooks.event?.(buildCommandExecutedEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.030Z",
      attributes: {
        eventType: "command.executed",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.commandExecuted,
      timestamp: "1970-01-01T00:00:00.030Z",
      sessionId: "session-1",
      attributes: {
        command: "ls",
        arguments: "-la",
        messageId: "message-2",
      },
    },
  ]);
});

test("command.executed records successful git operation telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 32,
    },
  });

  await hooks.event?.(buildGitCommitExecutedEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.032Z",
      attributes: {
        eventType: "command.executed",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.commandExecuted,
      timestamp: "1970-01-01T00:00:00.032Z",
      sessionId: "session-1",
      attributes: {
        command: "git",
        arguments: "commit -m test",
        messageId: "message-2",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.gitOperation,
      timestamp: "1970-01-01T00:00:00.032Z",
      sessionId: "session-1",
      attributes: {
        command: "git",
        arguments: "commit -m test",
        messageId: "message-2",
        operation: "commit",
        success: true,
      },
    },
  ]);
});

test("command.executed records successful git pr telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 33,
    },
  });

  await hooks.event?.(buildGitPrExecutedEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.033Z",
      attributes: {
        eventType: "command.executed",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.commandExecuted,
      timestamp: "1970-01-01T00:00:00.033Z",
      sessionId: "session-1",
      attributes: {
        command: "gh",
        arguments: "pr create --title test",
        messageId: "message-3",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.gitOperation,
      timestamp: "1970-01-01T00:00:00.033Z",
      sessionId: "session-1",
      attributes: {
        command: "gh",
        arguments: "pr create --title test",
        messageId: "message-3",
        operation: "pull_request",
        success: true,
      },
    },
  ]);
});

test("session.status records busy state telemetry with sparse attrs", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 56,
    },
  });

  await hooks.event?.({
    event: {
      type: "session.status",
      properties: {
        sessionID: "session-1",
        status: {
          type: "busy",
        },
      },
    },
  });

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.056Z",
      attributes: {
        eventType: "session.status",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.sessionStatus,
      timestamp: "1970-01-01T00:00:00.056Z",
      sessionId: "session-1",
      attributes: {
        status: "busy",
      },
    },
  ]);
});

test("file.edited records file telemetry with language", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 35,
    },
  });

  await hooks.event?.(buildFileEditedEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.035Z",
      attributes: {
        eventType: "file.edited",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.fileEdited,
      timestamp: "1970-01-01T00:00:00.035Z",
      attributes: {
        filePath: "src/main.ts",
        language: "typescript",
      },
    },
  ]);
});

test("session.created records session lifecycle telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 40,
    },
  });

  await hooks.event?.(buildSessionCreatedEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.040Z",
      attributes: {
        eventType: "session.created",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.sessionCreated,
      timestamp: "1970-01-01T00:00:00.040Z",
      sessionId: "session-1",
      attributes: {
        directory: "/tmp/project",
        title: "Telemetry session",
        additions: 4,
        deletions: 1,
        files: 2,
      },
    },
  ]);
});

test("session.idle records idle transition telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 45,
    },
  });

  await hooks.event?.(buildSessionIdleEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.045Z",
      attributes: {
        eventType: "session.idle",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.sessionIdle,
      timestamp: "1970-01-01T00:00:00.045Z",
      sessionId: "session-1",
      attributes: {},
    },
  ]);
});

test("session.error records error telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 50,
    },
  });

  await hooks.event?.(buildSessionErrorEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.050Z",
      attributes: {
        eventType: "session.error",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.sessionError,
      timestamp: "1970-01-01T00:00:00.050Z",
      sessionId: "session-1",
      attributes: {
        errorName: "APIError",
        errorMessage: "rate limited",
        statusCode: 429,
      },
    },
  ]);
});

test("session.status records retry state telemetry", async () => {
  const sink = new InMemoryTelemetrySink();
  const hooks = createOpencodeHooks(buildPluginInput(), {
    sink,
    clock: {
      nowMs: () => 55,
    },
  });

  await hooks.event?.(buildSessionStatusRetryEvent());

  expect(sink.drain()).toEqual([
    {
      name: TELEMETRY_EVENT_NAMES.eventReceived,
      timestamp: "1970-01-01T00:00:00.055Z",
      attributes: {
        eventType: "session.status",
      },
    },
    {
      name: TELEMETRY_EVENT_NAMES.sessionStatus,
      timestamp: "1970-01-01T00:00:00.055Z",
      sessionId: "session-1",
      attributes: {
        status: "retry",
        retryAttempt: 2,
        nextRetryDelayMs: 1500,
        errorMessage: "provider timeout",
      },
    },
  ]);
});
