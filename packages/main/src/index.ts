import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  ConsoleTelemetrySink,
  DurableTelemetrySink,
  FanoutTelemetrySink,
  HttpTelemetrySink,
  OTelJsonSink,
  resolveLanguageFromPath,
} from "@zenyr/telemetry-adapters";
import {
  DEFAULT_TELEMETRY_BUFFER_POLICY,
  SystemClock,
  type ClockPort,
  type TelemetryBufferPolicy,
  TelemetryService,
  type TelemetrySinkPort,
} from "@zenyr/telemetry-application";
import { TELEMETRY_EVENT_NAMES } from "@zenyr/telemetry-domain";

type EnvProvider = Record<string, string | undefined>;

type RuntimeOptions = {
  sink?: TelemetrySinkPort;
  clock?: ClockPort;
  env?: EnvProvider;
};

type ToolCallState = {
  startedAtMs: number;
};

type CompletionState = Map<string, number>;
type ReplayableSink = TelemetrySinkPort & {
  flushQueued?: () => Promise<void>;
};

const DEFAULT_ENV: EnvProvider = typeof Bun !== "undefined" ? Bun.env : {};

const readString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const readNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const getProp = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return Reflect.get(value, key);
};

const metadataFilePath = (metadata: unknown): string | undefined => {
  const filediff = getProp(metadata, "filediff");
  const fileFromDiff = readString(getProp(filediff, "file"));
  if (fileFromDiff) {
    return fileFromDiff;
  }

  return readString(getProp(metadata, "filepath"));
};

const permissionName = (permission: unknown): string => {
  return readString(getProp(permission, "type")) ?? "unknown";
};

const eventType = (event: unknown): string => {
  return readString(getProp(event, "type")) ?? "unknown";
};

const eventProperties = (event: unknown): unknown => {
  return getProp(event, "properties");
};

const isAssistantMessage = (message: unknown): boolean => {
  return readString(getProp(message, "role")) === "assistant";
};

const partTextLength = (parts: unknown): number => {
  if (!Array.isArray(parts)) {
    return 0;
  }

  let total = 0;

  for (const part of parts) {
    if (readString(getProp(part, "type")) !== "text") {
      continue;
    }

    total += (readString(getProp(part, "text")) ?? "").length;
  }

  return total;
};

const diffTotals = (
  diff: unknown,
): { additions: number; deletions: number; files: number } => {
  if (!Array.isArray(diff)) {
    return { additions: 0, deletions: 0, files: 0 };
  }

  return diff.reduce(
    (acc, item) => {
      acc.additions += readNumber(getProp(item, "additions")) ?? 0;
      acc.deletions += readNumber(getProp(item, "deletions")) ?? 0;
      acc.files += 1;
      return acc;
    },
    { additions: 0, deletions: 0, files: 0 },
  );
};

const recordAssistantMessage = async (
  service: TelemetryService,
  seenCompletions: CompletionState,
  message: unknown,
): Promise<void> => {
  if (!isAssistantMessage(message)) {
    return;
  }

  const messageId = readString(getProp(message, "id"));
  const sessionId = readString(getProp(message, "sessionID"));
  const completedAtMs = readNumber(getProp(getProp(message, "time"), "completed"));

  if (!messageId || completedAtMs === undefined) {
    return;
  }

  if (seenCompletions.get(messageId) === completedAtMs) {
    return;
  }

  seenCompletions.set(messageId, completedAtMs);

  const createdAtMs = readNumber(getProp(getProp(message, "time"), "created"));
  const durationMs =
    createdAtMs === undefined ? undefined : Math.max(0, completedAtMs - createdAtMs);
  const error = getProp(message, "error");
  const commonAttributes = {
    messageId,
    model: readString(getProp(message, "modelID")),
    provider: readString(getProp(message, "providerID")),
    durationMs,
    completedAtMs,
    success: error === undefined,
  };

  if (error) {
    await service.record({
      name: TELEMETRY_EVENT_NAMES.apiError,
      sessionId,
      attributes: {
        ...commonAttributes,
        errorName: readString(getProp(error, "name")) ?? "UnknownError",
        errorMessage: readString(getProp(getProp(error, "data"), "message")),
        statusCode: readNumber(getProp(getProp(error, "data"), "statusCode")),
      },
    });
    return;
  }

  await service.record({
    name: TELEMETRY_EVENT_NAMES.apiRequest,
    sessionId,
    attributes: {
      ...commonAttributes,
      costUsd: readNumber(getProp(message, "cost")),
      inputTokens: readNumber(getProp(getProp(message, "tokens"), "input")),
      outputTokens: readNumber(getProp(getProp(message, "tokens"), "output")),
      reasoningTokens: readNumber(getProp(getProp(message, "tokens"), "reasoning")),
      cacheReadTokens: readNumber(
        getProp(getProp(getProp(message, "tokens"), "cache"), "read"),
      ),
      cacheWriteTokens: readNumber(
        getProp(getProp(getProp(message, "tokens"), "cache"), "write"),
      ),
    },
  });
};

const readInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveBufferPolicy = (env: EnvProvider): Partial<TelemetryBufferPolicy> => {
  return {
    maxBatchSize: readInt(
      env.OPENCODE_TELEMETRY_MAX_BATCH_SIZE,
      DEFAULT_TELEMETRY_BUFFER_POLICY.maxBatchSize,
    ),
    flushIntervalMs: readInt(
      env.OPENCODE_TELEMETRY_FLUSH_INTERVAL_MS,
      DEFAULT_TELEMETRY_BUFFER_POLICY.flushIntervalMs,
    ),
  };
};

const withDurabilityFromEnv = (
  sink: TelemetrySinkPort,
  env: EnvProvider,
): ReplayableSink => {
  const queueDir = env.OPENCODE_TELEMETRY_QUEUE_DIR;

  if (!queueDir) {
    return sink;
  }

  return new DurableTelemetrySink({
    sink,
    queueDir,
  });
};

const withFanoutFromEnv = (
  sink: TelemetrySinkPort,
  env: EnvProvider,
): TelemetrySinkPort => {
  if (env.OPENCODE_TELEMETRY_MIRROR_CONSOLE !== "1") {
    return sink;
  }

  return new FanoutTelemetrySink({
    sinks: [sink, new ConsoleTelemetrySink()],
  });
};

const startReplay = (sink: ReplayableSink): Promise<void> => {
  return sink.flushQueued?.() ?? Promise.resolve();
};

export const createTelemetrySinkFromEnv = (
  env: EnvProvider = DEFAULT_ENV,
): TelemetrySinkPort => {
  const sinkType = env.OPENCODE_TELEMETRY_SINK ??
    (env.OPENCODE_TELEMETRY_HTTP_ENDPOINT ? "http" : "console");

  if (sinkType === "console") {
    return withDurabilityFromEnv(
      withFanoutFromEnv(new ConsoleTelemetrySink(), env),
      env,
    );
  }

  if (sinkType === "http") {
    if (!env.OPENCODE_TELEMETRY_HTTP_ENDPOINT) {
      throw new Error("OPENCODE_TELEMETRY_HTTP_ENDPOINT req for http sink");
    }

    return withDurabilityFromEnv(
      withFanoutFromEnv(
        new HttpTelemetrySink({
          endpoint: env.OPENCODE_TELEMETRY_HTTP_ENDPOINT,
          token: env.OPENCODE_TELEMETRY_HTTP_TOKEN,
          maxAttempts: readInt(env.OPENCODE_TELEMETRY_HTTP_MAX_ATTEMPTS, 8),
          backoffMs: readInt(env.OPENCODE_TELEMETRY_HTTP_BACKOFF_MS, 500),
        }),
        env,
      ),
      env,
    );
  }

  if (sinkType === "otel-json") {
    return withDurabilityFromEnv(
      withFanoutFromEnv(
        new OTelJsonSink({
          serviceName: env.OPENCODE_TELEMETRY_SERVICE_NAME,
          serviceVersion: env.OPENCODE_TELEMETRY_SERVICE_VERSION,
          channelId: env.OPENCODE_TELEMETRY_CHANNEL_ID,
        }),
        env,
      ),
      env,
    );
  }

  throw new Error(`Unsupported telemetry sink: ${sinkType}`);
};

export const createOpencodeHooks = (
  input: PluginInput,
  options: RuntimeOptions = {},
): Hooks => {
  const env = options.env ?? DEFAULT_ENV;
  const clock = options.clock ?? new SystemClock();
  const sink = (options.sink ?? createTelemetrySinkFromEnv(env)) as ReplayableSink;
  const service = new TelemetryService({
    sink,
    clock,
    bufferPolicy: resolveBufferPolicy(env),
  });
  const ready = startReplay(sink);
  const toolCalls = new Map<string, ToolCallState>();
  const seenCompletions: CompletionState = new Map();
  const record = async (
    input: Parameters<TelemetryService["record"]>[0],
  ): Promise<void> => {
    await ready;
    await service.record(input);
  };

  return {
    "chat.message": async (messageInput, messageOutput) => {
      await record({
        name: TELEMETRY_EVENT_NAMES.chatMessage,
        sessionId: messageInput.sessionID,
        attributes: {
          agent: messageInput.agent,
          messageId: messageInput.messageID,
          model: messageInput.model?.modelID,
          promptLength: partTextLength(messageOutput.parts),
          provider: messageInput.model?.providerID,
          variant: messageInput.variant,
        },
      });
    },

    config: async (config) => {
      await record({
        name: TELEMETRY_EVENT_NAMES.configLoaded,
        attributes: {
          directory: input.directory,
          worktree: input.worktree,
          hasModel: Boolean(getProp(config, "model")),
        },
      });
    },

    event: async ({ event }) => {
      await record({
        name: TELEMETRY_EVENT_NAMES.eventReceived,
        attributes: {
          eventType: eventType(event),
        },
      });

      if (eventType(event) === "message.updated") {
        await recordAssistantMessage(
          service,
          seenCompletions,
          getProp(eventProperties(event), "info"),
        );
      }

      if (eventType(event) === "session.diff") {
        const properties = eventProperties(event);
        const totals = diffTotals(getProp(properties, "diff"));

        await record({
          name: TELEMETRY_EVENT_NAMES.sessionDiff,
          sessionId: readString(getProp(properties, "sessionID")),
          attributes: totals,
        });
      }

      if (eventType(event) === "command.executed") {
        const properties = eventProperties(event);
        const command = readString(getProp(properties, "name"));
        const argumentsText = readString(getProp(properties, "arguments"));
        const operation =
          command === "git" && argumentsText?.includes("commit")
            ? "commit"
            : command === "gh" && argumentsText?.includes("pr create")
            ? "pull_request"
            : undefined;

        await record({
          name: TELEMETRY_EVENT_NAMES.commandExecuted,
          sessionId: readString(getProp(properties, "sessionID")),
          attributes: {
            command,
            arguments: argumentsText,
            messageId: readString(getProp(properties, "messageID")),
          },
        });

        if (operation) {
          await record({
            name: TELEMETRY_EVENT_NAMES.gitOperation,
            sessionId: readString(getProp(properties, "sessionID")),
            attributes: {
              command,
              arguments: argumentsText,
              messageId: readString(getProp(properties, "messageID")),
              operation,
              success: true,
            },
          });
        }
      }

      if (eventType(event) === "file.edited") {
        const properties = eventProperties(event);
        const filePath = readString(getProp(properties, "file"));

        await record({
          name: TELEMETRY_EVENT_NAMES.fileEdited,
          attributes: {
            filePath,
            language: filePath ? resolveLanguageFromPath(filePath) : undefined,
          },
        });
      }

      if (eventType(event) === "session.created") {
        const properties = eventProperties(event);
        const info = getProp(properties, "info");
        const summary = getProp(info, "summary");

        await record({
          name: TELEMETRY_EVENT_NAMES.sessionCreated,
          sessionId: readString(getProp(info, "id")),
          attributes: {
            directory: readString(getProp(info, "directory")),
            title: readString(getProp(info, "title")),
            additions: readNumber(getProp(summary, "additions")),
            deletions: readNumber(getProp(summary, "deletions")),
            files: readNumber(getProp(summary, "files")),
          },
        });
      }

      if (eventType(event) === "session.idle") {
        const properties = eventProperties(event);

        await record({
          name: TELEMETRY_EVENT_NAMES.sessionIdle,
          sessionId: readString(getProp(properties, "sessionID")),
        });
      }

      if (eventType(event) === "session.error") {
        const properties = eventProperties(event);
        const error = getProp(properties, "error");

        await record({
          name: TELEMETRY_EVENT_NAMES.sessionError,
          sessionId: readString(getProp(properties, "sessionID")),
          attributes: {
            errorName: readString(getProp(error, "name")) ?? "UnknownError",
            errorMessage: readString(getProp(getProp(error, "data"), "message")),
            provider: readString(getProp(getProp(error, "data"), "providerID")),
            statusCode: readNumber(getProp(getProp(error, "data"), "statusCode")),
          },
        });
      }

      if (eventType(event) === "session.status") {
        const properties = eventProperties(event);
        const status = getProp(properties, "status");

        await record({
          name: TELEMETRY_EVENT_NAMES.sessionStatus,
          sessionId: readString(getProp(properties, "sessionID")),
          attributes: {
            status: readString(getProp(status, "type")),
            retryAttempt: readNumber(getProp(status, "attempt")),
            nextRetryDelayMs: readNumber(getProp(status, "next")),
            errorMessage: readString(getProp(status, "message")),
          },
        });
      }
    },

    "permission.ask": async (permission, output) => {
      await record({
        name: TELEMETRY_EVENT_NAMES.permissionAsk,
        sessionId: readString(getProp(permission, "sessionID")),
        attributes: {
          status: output.status,
          permission: permissionName(permission),
        },
      });
    },

    "command.execute.before": async (commandInput) => {
      const isGitCommit =
        commandInput.command === "git" && commandInput.arguments.includes("commit");
      const isGitPrCreate =
        commandInput.command === "gh" && commandInput.arguments.includes("pr create");

      await record({
        name: TELEMETRY_EVENT_NAMES.commandExecuteBefore,
        sessionId: commandInput.sessionID,
        attributes: {
          command: commandInput.command,
          arguments: commandInput.arguments,
          isGitCommit,
          isGitPrCreate,
        },
      });
    },

    "tool.execute.before": async (toolInput) => {
      toolCalls.set(toolInput.callID, {
        startedAtMs: clock.nowMs(),
      });

      await record({
        name: TELEMETRY_EVENT_NAMES.toolExecuteBefore,
        sessionId: toolInput.sessionID,
        attributes: {
          tool: toolInput.tool,
          callId: toolInput.callID,
          timestampSource: "hook",
        },
      });
    },

    "tool.execute.after": async (toolInput, toolOutput) => {
      const state = toolCalls.get(toolInput.callID);
      toolCalls.delete(toolInput.callID);

      const durationMs = state ? Math.max(0, clock.nowMs() - state.startedAtMs) : 0;
      const filePath = metadataFilePath(toolOutput.metadata);
      const language = filePath ? resolveLanguageFromPath(filePath) : undefined;

      await record({
        name: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
        sessionId: toolInput.sessionID,
        attributes: {
          tool: toolInput.tool,
          callId: toolInput.callID,
          durationMs,
          filePath,
          language,
          timestampSource: "hook",
          title: toolOutput.title,
        },
      });
    },
  };
};

const plugin: Plugin = async (input) => {
  return createOpencodeHooks(input);
};

export default plugin;
