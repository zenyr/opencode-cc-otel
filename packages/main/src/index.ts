import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  Anthropic1PBatchSink,
  DurableTelemetrySink,
  FanoutTelemetrySink,
  ModelPricingCache,
  NdjsonFileWriter,
  SecondPartyOtelSink,
  resolveLanguageFromPath,
} from "@zenyr/telemetry-adapters";
import {
  type ClockPort,
  DEFAULT_TELEMETRY_BUFFER_POLICY,
  SystemClock,
  type TelemetryBufferPolicy,
  TelemetryService,
  type TelemetrySinkPort,
} from "@zenyr/telemetry-application";
import {
  type ModelPricingPort,
  TELEMETRY_EVENT_NAMES,
  estimateCostUsd,
} from "@zenyr/telemetry-domain";

type EnvProvider = Record<string, string | undefined>;

type TelemetryHttpTarget = {
  endpoint: string;
  token?: string;
};

type TelemetryHttpConfigFile = {
  default?: TelemetryHttpTarget;
};

type TelemetryOtelConfig = {
  serviceName?: string;
  serviceVersion?: string;
  logsChannelId?: string;
  metricsChannelId?: string;
  resourceAttributes?: Record<string, string>;
};

type SecondPartyTransport = "file" | "console";

type SecondPartyFileConfig = {
  path?: string;
};

type FirstPartyChannelConfig = {
  enabled?: boolean;
  sink: "http";
  http?: TelemetryHttpConfigFile;
};

type SecondPartyChannelConfig = {
  enabled?: boolean;
  sink: "otel-json";
  transport?: SecondPartyTransport;
  file?: SecondPartyFileConfig;
  otel?: TelemetryOtelConfig;
};

type ThirdPartyChannelConfig = {
  enabled?: boolean;
};

type ProviderFilterConfig = {
  allow: string[];
};

type TelemetryConfigFile = {
  channels?: {
    firstParty?: FirstPartyChannelConfig;
    secondParty?: SecondPartyChannelConfig;
    thirdParty?: ThirdPartyChannelConfig;
  };
  providerFilter?: ProviderFilterConfig;
};

type RuntimeOptions = {
  sink?: TelemetrySinkPort;
  clock?: ClockPort;
  env?: EnvProvider;
  pricing?: ModelPricingPort;
  providerFilter?: ProviderFilterConfig;
};

type ToolCallState = {
  startedAtMs: number;
};

type CommandCallState = {
  startedAtMs: number;
};

type CompletionState = Map<string, number>;
type ReplayableSink = TelemetrySinkPort & {
  flushQueued?: () => Promise<void>;
};

class NoopTelemetrySink implements TelemetrySinkPort {
  async publish(): Promise<void> {}
}

const DEFAULT_ENV: EnvProvider = typeof Bun !== "undefined" ? Bun.env : {};
const DEFAULT_CONFIG_PATH_SEGMENTS = ["opencode", "telemetry.jsonc"];
const DEFAULT_2P_NDJSON_PATH_SEGMENTS = [
  "opencode",
  "telemetry",
  "otel.ndjson",
];

const readString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const readNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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

const partText = (parts: unknown): string => {
  if (!Array.isArray(parts)) {
    return "";
  }

  let text = "";
  for (const part of parts) {
    if (readString(getProp(part, "type")) !== "text") {
      continue;
    }

    text += readString(getProp(part, "text")) ?? "";
  }

  return text;
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

const readInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveBufferPolicy = (
  env: EnvProvider,
): Partial<TelemetryBufferPolicy> => {
  return {
    maxBatchSize: readInt(
      env.OPENCODE_CC_OTEL_MAX_BATCH_SIZE,
      DEFAULT_TELEMETRY_BUFFER_POLICY.maxBatchSize,
    ),
    flushIntervalMs: readInt(
      env.OPENCODE_CC_OTEL_FLUSH_INTERVAL_MS,
      DEFAULT_TELEMETRY_BUFFER_POLICY.flushIntervalMs,
    ),
  };
};

const stripJsonComments = (input: string): string => {
  let output = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index] ?? "";
    const next = input[index + 1] ?? "";

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        output += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += current;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === '"') {
        inString = false;
      }

      continue;
    }

    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
};

const stripTrailingCommas = (input: string): string => {
  return input.replace(/,\s*([}\]])/g, "$1");
};

export const parseJsoncObject = <T>(input: string): T => {
  return JSON.parse(stripTrailingCommas(stripJsonComments(input))) as T;
};

const resolveConfigValue = (
  env: EnvProvider,
  value: string | undefined,
): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (!value.startsWith("env:")) {
    return value;
  }

  return env[value.slice(4)];
};

const defaultTelemetryConfigPath = (env: EnvProvider): string => {
  const configRoot = env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configRoot, ...DEFAULT_CONFIG_PATH_SEGMENTS);
};

const defaultSecondPartyNdjsonPath = (env: EnvProvider): string => {
  const dataRoot = env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(dataRoot, ...DEFAULT_2P_NDJSON_PATH_SEGMENTS);
};

const secondPartyFilePath = (
  env: EnvProvider,
  channel?: SecondPartyChannelConfig,
): string => {
  return (
    resolveConfigValue(env, channel?.file?.path) ??
    env.OPENCODE_CC_OTEL_2P_FILE_PATH ??
    defaultSecondPartyNdjsonPath(env)
  );
};

const resolveProviderFilter = (
  env: EnvProvider,
  override?: ProviderFilterConfig,
): Set<string> | undefined => {
  if (override) {
    return override.allow.length > 0
      ? new Set(override.allow.map((p) => p.toLowerCase()))
      : undefined;
  }

  const config = loadTelemetryConfig(env);
  const filter = config?.providerFilter;
  if (!filter || filter.allow.length === 0) {
    return undefined;
  }

  return new Set(filter.allow.map((p) => p.toLowerCase()));
};

const isProviderAllowed = (
  allowSet: Set<string> | undefined,
  provider: string | undefined,
): boolean => {
  // no filter configured → allow all
  if (!allowSet) {
    return true;
  }
  // filter configured but provider unknown → drop
  if (!provider) {
    return false;
  }
  return allowSet.has(provider.toLowerCase());
};

const buildSecondPartyWriter = (
  env: EnvProvider,
  channel?: SecondPartyChannelConfig,
): ((payload: string) => Promise<void>) => {
  const transport = channel?.transport ?? "file";

  if (transport === "console") {
    return async (payload) => {
      console.log(payload);
    };
  }

  const writer = new NdjsonFileWriter({
    path: secondPartyFilePath(env, channel),
  });

  return (payload) => writer.write(payload);
};

export const loadTelemetryConfig = (
  env: EnvProvider = DEFAULT_ENV,
): TelemetryConfigFile | undefined => {
  const configPath =
    env.OPENCODE_CC_OTEL_CONFIG_PATH ?? defaultTelemetryConfigPath(env);

  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    return parseJsoncObject<TelemetryConfigFile>(
      readFileSync(configPath, "utf8"),
    );
  } catch {
    return undefined;
  }
};

const withDurability = (
  sink: TelemetrySinkPort,
  queueDir: string | undefined,
): ReplayableSink => {
  if (!queueDir) {
    return sink;
  }

  return new DurableTelemetrySink({
    sink,
    queueDir,
  });
};

const startReplay = (sink: ReplayableSink): Promise<void> => {
  return sink.flushQueued?.() ?? Promise.resolve();
};

const buildFirstPartySink = (
  env: EnvProvider,
  channel?: FirstPartyChannelConfig,
  options?: {
    defaultEnabled?: boolean;
  },
): ReplayableSink | undefined => {
  const enabled = channel?.enabled ?? options?.defaultEnabled ?? true;
  if (!enabled) {
    return undefined;
  }

  const endpoint =
    resolveConfigValue(env, channel?.http?.default?.endpoint) ??
    env.OPENCODE_CC_OTEL_HTTP_ENDPOINT;
  if (!endpoint) {
    return undefined;
  }

  return withDurability(
    new Anthropic1PBatchSink({
      endpoint,
      token:
        resolveConfigValue(env, channel?.http?.default?.token) ??
        env.OPENCODE_CC_OTEL_HTTP_TOKEN,
      maxAttempts: readInt(env.OPENCODE_CC_OTEL_HTTP_MAX_ATTEMPTS, 8),
      backoffMs: readInt(env.OPENCODE_CC_OTEL_HTTP_BACKOFF_MS, 500),
    }),
    env.OPENCODE_CC_OTEL_QUEUE_DIR,
  );
};

const buildSecondPartySink = (
  env: EnvProvider,
  channel?: SecondPartyChannelConfig,
): ReplayableSink | undefined => {
  if (channel?.enabled === false) {
    return undefined;
  }

  return new SecondPartyOtelSink({
    write: buildSecondPartyWriter(env, channel),
    serviceName:
      resolveConfigValue(env, channel?.otel?.serviceName) ??
      env.OPENCODE_CC_OTEL_SERVICE_NAME,
    serviceVersion:
      resolveConfigValue(env, channel?.otel?.serviceVersion) ??
      env.OPENCODE_CC_OTEL_SERVICE_VERSION,
    logsChannelId:
      resolveConfigValue(env, channel?.otel?.logsChannelId) ??
      env.OPENCODE_CC_OTEL_LOGS_CHANNEL_ID,
    metricsChannelId:
      resolveConfigValue(env, channel?.otel?.metricsChannelId) ??
      env.OPENCODE_CC_OTEL_METRICS_CHANNEL_ID,
    resourceAttributes: channel?.otel?.resourceAttributes,
  });
};

const buildSinkFromChannels = (env: EnvProvider): ReplayableSink => {
  const config = loadTelemetryConfig(env);
  const channels = config?.channels;

  if (channels?.thirdParty?.enabled) {
    throw new Error("thirdParty telemetry unsupported yet");
  }

  const firstParty = buildFirstPartySink(env, channels?.firstParty, {
    defaultEnabled: false,
  });
  const secondParty = buildSecondPartySink(env, channels?.secondParty);
  const sinks = [firstParty, secondParty].filter(
    (sink): sink is ReplayableSink => sink !== undefined,
  );

  if (sinks.length === 0) {
    return new NoopTelemetrySink();
  }

  if (sinks.length === 1) {
    const sink = sinks[0];
    if (!sink) {
      return new NoopTelemetrySink();
    }
    return sink;
  }

  return new FanoutTelemetrySink({ sinks });
};

export const createTelemetrySinkFromEnv = (
  env: EnvProvider = DEFAULT_ENV,
): ReplayableSink => {
  const config = loadTelemetryConfig(env);
  if (config?.channels) {
    return buildSinkFromChannels(env);
  }

  const sinkType =
    env.OPENCODE_CC_OTEL_SINK ??
    (env.OPENCODE_CC_OTEL_HTTP_ENDPOINT ? "http" : "otel-json");

  if (sinkType === "http") {
    const firstParty = buildFirstPartySink(
      env,
      {
        sink: "http",
      },
      {
        defaultEnabled: true,
      },
    );
    if (!firstParty) {
      throw new Error("OPENCODE_CC_OTEL_HTTP_ENDPOINT req for http sink");
    }
    return firstParty;
  }

  if (sinkType === "otel-json") {
    return (
      buildSecondPartySink(env, {
        sink: "otel-json",
      }) ?? new NoopTelemetrySink()
    );
  }

  if (sinkType === "console") {
    return (
      buildSecondPartySink(env, {
        sink: "otel-json",
        transport: "console",
      }) ?? new NoopTelemetrySink()
    );
  }

  throw new Error(`Unsupported telemetry sink: ${sinkType}`);
};

const recordApiSuccess = async (
  service: TelemetryService,
  seenCompletions: CompletionState,
  message: unknown,
  pricing?: ModelPricingPort,
): Promise<void> => {
  if (!isAssistantMessage(message)) {
    return;
  }

  const messageId = readString(getProp(message, "id"));
  const sessionId = readString(getProp(message, "sessionID"));
  const completedAtMs = readNumber(
    getProp(getProp(message, "time"), "completed"),
  );

  if (!messageId || completedAtMs === undefined) {
    return;
  }

  if (seenCompletions.get(messageId) === completedAtMs) {
    return;
  }

  seenCompletions.set(messageId, completedAtMs);

  const createdAtMs = readNumber(getProp(getProp(message, "time"), "created"));
  const durationMs =
    createdAtMs === undefined
      ? undefined
      : Math.max(0, completedAtMs - createdAtMs);
  const error = getProp(message, "error");
  const model = readString(getProp(message, "modelID"));
  const provider = readString(getProp(message, "providerID"));
  const inputTokens = readNumber(getProp(getProp(message, "tokens"), "input"));
  const outputTokens = readNumber(
    getProp(getProp(message, "tokens"), "output"),
  );
  const cacheReadTokens = readNumber(
    getProp(getProp(getProp(message, "tokens"), "cache"), "read"),
  );
  const cacheCreationTokens = readNumber(
    getProp(getProp(getProp(message, "tokens"), "cache"), "write"),
  );
  let costUsd = readNumber(getProp(message, "cost"));

  // upstream may report 0 — estimate from token counts when pricing available
  if ((costUsd === undefined || costUsd === 0) && pricing && model) {
    const modelCost = await pricing.lookup(model);
    if (modelCost) {
      costUsd = estimateCostUsd({
        cost: modelCost,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      });
    }
  }

  if (error) {
    await service.record({
      channel: "firstParty",
      name: TELEMETRY_EVENT_NAMES.firstParty.apiError,
      sessionId,
      attributes: {
        model,
        provider,
        durationMs,
        error: readString(getProp(getProp(error, "data"), "message")),
        status: readNumber(getProp(getProp(error, "data"), "statusCode")),
      },
    });

    await service.record({
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondParty.apiError,
      sessionId,
      attributes: {
        model,
        provider,
        duration_ms: durationMs,
        error: readString(getProp(getProp(error, "data"), "message")),
        status_code: readNumber(getProp(getProp(error, "data"), "statusCode")),
      },
    });
    return;
  }

  await service.record({
    channel: "firstParty",
    name: TELEMETRY_EVENT_NAMES.firstParty.apiSuccess,
    sessionId,
    attributes: {
      model,
      provider,
      durationMs,
      inputTokens,
      outputTokens,
      cachedInputTokens: cacheReadTokens,
      cacheCreationTokens,
      costUSD: costUsd,
    },
  });

  await service.record({
    channel: "secondParty",
    name: TELEMETRY_EVENT_NAMES.secondParty.apiRequest,
    sessionId,
    attributes: {
      model,
      provider,
      duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_creation_tokens: cacheCreationTokens,
      cost_usd: costUsd,
    },
  });

  if (costUsd !== undefined) {
    await service.record({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.costUsage,
      sessionId,
      unit: "USD",
      value: costUsd,
      attributes: {
        model,
      },
    });
  }

  const tokenMetrics = [
    ["input", inputTokens],
    ["output", outputTokens],
    ["cacheRead", cacheReadTokens],
    ["cacheCreation", cacheCreationTokens],
  ] as const;

  for (const [type, value] of tokenMetrics) {
    if (value === undefined) {
      continue;
    }

    await service.record({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      sessionId,
      unit: "tokens",
      value,
      attributes: {
        model,
        type,
      },
    });
  }
};

const commandStateKey = (
  sessionId: string | undefined,
  command: string | undefined,
  argumentsText: string | undefined,
): string => {
  return [sessionId ?? "", command ?? "", argumentsText ?? ""].join(":");
};

const recordCommandMetrics = async (
  service: TelemetryService,
  sessionId: string | undefined,
  command: string | undefined,
  argumentsText: string | undefined,
  durationMs: number | undefined,
): Promise<void> => {
  const operation =
    command === "git" && argumentsText?.includes("commit")
      ? TELEMETRY_EVENT_NAMES.secondPartyMetrics.commitCount
      : command === "gh" && argumentsText?.includes("pr create")
        ? TELEMETRY_EVENT_NAMES.secondPartyMetrics.pullRequestCount
        : undefined;

  if (operation) {
    await service.record({
      kind: "metric",
      channel: "secondParty",
      name: operation,
      sessionId,
      unit: "{count}",
      value: 1,
      attributes: {},
    });
  }

  if (durationMs !== undefined) {
    await service.record({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.activeTimeTotal,
      sessionId,
      unit: "s",
      value: Math.max(0, durationMs / 1000),
      attributes: {
        type: "cli",
      },
    });
  }
};

export const createOpencodeHooks = (
  input: PluginInput,
  options: RuntimeOptions = {},
): Hooks => {
  const env = options.env ?? DEFAULT_ENV;
  const clock = options.clock ?? new SystemClock();
  const pricing = options.pricing ?? new ModelPricingCache({ env });
  const sink = (options.sink ??
    createTelemetrySinkFromEnv(env)) as ReplayableSink;
  const service = new TelemetryService({
    sink,
    clock,
    bufferPolicy: resolveBufferPolicy(env),
  });
  const ready = startReplay(sink);
  const toolCalls = new Map<string, ToolCallState>();
  const commandCalls = new Map<string, CommandCallState>();
  const seenCompletions: CompletionState = new Map();
  const providerAllowSet = resolveProviderFilter(env, options.providerFilter);
  // track last known provider per session for provider-agnostic hooks
  const activeProvider = new Map<string, string>();

  const record = async (
    telemetryInput: Parameters<TelemetryService["record"]>[0],
  ): Promise<void> => {
    await ready;
    await service.record(telemetryInput);
  };

  return {
    "chat.message": async (messageInput, messageOutput) => {
      const provider = messageInput.model?.providerID;

      // track active provider per session (before filter check)
      if (provider && messageInput.sessionID) {
        activeProvider.set(messageInput.sessionID, provider);
      }

      if (!isProviderAllowed(providerAllowSet, provider)) {
        return;
      }

      const prompt = partText(messageOutput.parts);
      const promptLength = prompt.length;

      await record({
        channel: "firstParty",
        name: TELEMETRY_EVENT_NAMES.firstParty.inputPrompt,
        sessionId: messageInput.sessionID,
        attributes: {
          promptLength,
          model: messageInput.model?.modelID,
          provider,
        },
      });

      await record({
        channel: "secondParty",
        name: TELEMETRY_EVENT_NAMES.secondParty.userPrompt,
        sessionId: messageInput.sessionID,
        attributes: {
          "prompt.id": messageInput.messageID,
          prompt_length: promptLength,
          model: messageInput.model?.modelID,
          provider,
        },
      });
    },

    config: async () => {
      await record({
        kind: "metric",
        channel: "secondParty",
        name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.sessionCount,
        unit: "{count}",
        value: 1,
        attributes: {
          directory: input.directory,
          worktree: input.worktree,
        },
      });
    },

    event: async ({ event }) => {
      if (eventType(event) === "message.updated") {
        const message = getProp(eventProperties(event), "info");
        const msgProvider = readString(getProp(message, "providerID"));
        if (!isProviderAllowed(providerAllowSet, msgProvider)) {
          return;
        }
        await ready;
        await recordApiSuccess(service, seenCompletions, message, pricing);
      }

      if (eventType(event) === "session.diff") {
        const properties = eventProperties(event);
        const sessionId = readString(getProp(properties, "sessionID"));

        if (
          providerAllowSet &&
          !isProviderAllowed(
            providerAllowSet,
            sessionId ? activeProvider.get(sessionId) : undefined,
          )
        ) {
          return;
        }

        const totals = diffTotals(getProp(properties, "diff"));

        if (totals.additions > 0) {
          await record({
            kind: "metric",
            channel: "secondParty",
            name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.linesOfCodeCount,
            sessionId,
            unit: "{count}",
            value: totals.additions,
            attributes: {
              type: "added",
            },
          });
        }

        if (totals.deletions > 0) {
          await record({
            kind: "metric",
            channel: "secondParty",
            name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.linesOfCodeCount,
            sessionId,
            unit: "{count}",
            value: totals.deletions,
            attributes: {
              type: "removed",
            },
          });
        }
      }

      if (eventType(event) === "command.executed") {
        const properties = eventProperties(event);
        const sessionId = readString(getProp(properties, "sessionID"));
        const command = readString(getProp(properties, "name"));
        const argumentsText = readString(getProp(properties, "arguments"));
        const key = commandStateKey(sessionId, command, argumentsText);
        const state = commandCalls.get(key);
        commandCalls.delete(key);

        if (
          providerAllowSet &&
          !isProviderAllowed(
            providerAllowSet,
            sessionId ? activeProvider.get(sessionId) : undefined,
          )
        ) {
          return;
        }

        const durationMs = state
          ? Math.max(0, clock.nowMs() - state.startedAtMs)
          : undefined;

        await record({
          channel: "firstParty",
          name: TELEMETRY_EVENT_NAMES.firstParty.inputCommand,
          sessionId,
          attributes: {
            input: [command, argumentsText].filter(Boolean).join(" "),
          },
        });

        await recordCommandMetrics(
          service,
          sessionId,
          command,
          argumentsText,
          durationMs,
        );
      }
    },

    "permission.ask": async (permission, output) => {
      const permSessionId = readString(getProp(permission, "sessionID"));
      if (
        providerAllowSet &&
        !isProviderAllowed(
          providerAllowSet,
          permSessionId ? activeProvider.get(permSessionId) : undefined,
        )
      ) {
        return;
      }

      const toolName = permissionName(permission);
      const decision = output.status === "allow" ? "accept" : "reject";
      const lowerToolName = toolName.toLowerCase();
      const isCodeEditTool =
        lowerToolName.includes("edit") ||
        lowerToolName.includes("write") ||
        lowerToolName.includes("notebook");

      await record({
        channel: "secondParty",
        name: TELEMETRY_EVENT_NAMES.secondParty.toolDecision,
        sessionId: readString(getProp(permission, "sessionID")),
        attributes: {
          tool_name: toolName,
          decision,
          source: "unknown",
        },
      });

      if (isCodeEditTool) {
        await record({
          kind: "metric",
          channel: "secondParty",
          name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.codeEditToolDecision,
          sessionId: readString(getProp(permission, "sessionID")),
          unit: "{count}",
          value: 1,
          attributes: {
            decision,
            source: "unknown",
            tool_name: toolName,
          },
        });
      }
    },

    "command.execute.before": async (commandInput) => {
      commandCalls.set(
        commandStateKey(
          commandInput.sessionID,
          commandInput.command,
          commandInput.arguments,
        ),
        {
          startedAtMs: clock.nowMs(),
        },
      );
    },

    "tool.execute.before": async (toolInput) => {
      toolCalls.set(toolInput.callID, {
        startedAtMs: clock.nowMs(),
      });
    },

    "tool.execute.after": async (toolInput, toolOutput) => {
      const state = toolCalls.get(toolInput.callID);
      toolCalls.delete(toolInput.callID);

      if (
        providerAllowSet &&
        !isProviderAllowed(
          providerAllowSet,
          activeProvider.get(toolInput.sessionID),
        )
      ) {
        return;
      }

      const durationMs = state
        ? Math.max(0, clock.nowMs() - state.startedAtMs)
        : 0;
      const filePath = metadataFilePath(toolOutput.metadata);
      const language = filePath ? resolveLanguageFromPath(filePath) : undefined;
      const outputSizeBytes = Buffer.byteLength(
        String(toolOutput.output ?? ""),
      );

      await record({
        channel: "firstParty",
        name: TELEMETRY_EVENT_NAMES.firstParty.toolUseSuccess,
        sessionId: toolInput.sessionID,
        attributes: {
          toolName: toolInput.tool,
          durationMs,
          toolResultSizeBytes: outputSizeBytes,
          fileExtension: language,
        },
      });

      await record({
        channel: "secondParty",
        name: TELEMETRY_EVENT_NAMES.secondParty.toolResult,
        sessionId: toolInput.sessionID,
        attributes: {
          tool_name: toolInput.tool,
          success: true,
          duration_ms: durationMs,
          tool_result_size_bytes: outputSizeBytes,
          file_path: filePath,
          language,
        },
      });
    },
  };
};

const plugin: Plugin = async (input) => {
  return createOpencodeHooks(input);
};

export default plugin;
