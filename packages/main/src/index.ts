import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  ConsoleTelemetrySink,
  HttpTelemetrySink,
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

const DEFAULT_ENV: EnvProvider = typeof Bun !== "undefined" ? Bun.env : {};

const readString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
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

export const createTelemetrySinkFromEnv = (
  env: EnvProvider = DEFAULT_ENV,
): TelemetrySinkPort => {
  const sinkType = env.OPENCODE_TELEMETRY_SINK ??
    (env.OPENCODE_TELEMETRY_HTTP_ENDPOINT ? "http" : "console");

  if (sinkType === "console") {
    return new ConsoleTelemetrySink();
  }

  if (sinkType === "http") {
    if (!env.OPENCODE_TELEMETRY_HTTP_ENDPOINT) {
      throw new Error("OPENCODE_TELEMETRY_HTTP_ENDPOINT req for http sink");
    }

    return new HttpTelemetrySink({
      endpoint: env.OPENCODE_TELEMETRY_HTTP_ENDPOINT,
      token: env.OPENCODE_TELEMETRY_HTTP_TOKEN,
      maxAttempts: readInt(env.OPENCODE_TELEMETRY_HTTP_MAX_ATTEMPTS, 8),
      backoffMs: readInt(env.OPENCODE_TELEMETRY_HTTP_BACKOFF_MS, 500),
    });
  }

  throw new Error(`Unsupported telemetry sink: ${sinkType}`);
};

export const createOpencodeHooks = (
  input: PluginInput,
  options: RuntimeOptions = {},
): Hooks => {
  const env = options.env ?? DEFAULT_ENV;
  const clock = options.clock ?? new SystemClock();
  const service = new TelemetryService({
    sink: options.sink ?? createTelemetrySinkFromEnv(env),
    clock,
    bufferPolicy: resolveBufferPolicy(env),
  });
  const toolCalls = new Map<string, ToolCallState>();

  return {
    config: async (config) => {
      await service.record({
        name: TELEMETRY_EVENT_NAMES.configLoaded,
        attributes: {
          directory: input.directory,
          worktree: input.worktree,
          hasModel: Boolean(getProp(config, "model")),
        },
      });
    },

    event: async ({ event }) => {
      await service.record({
        name: TELEMETRY_EVENT_NAMES.eventReceived,
        attributes: {
          eventType: readString(getProp(event, "type")) ?? "unknown",
        },
      });
    },

    "permission.ask": async (permission, output) => {
      await service.record({
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

      await service.record({
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

      await service.record({
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

      await service.record({
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
