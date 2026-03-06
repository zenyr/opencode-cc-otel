export type TelemetryAttributeValue = string | number | boolean;

export const TELEMETRY_EVENT_NAMES = {
  apiError: "opencode.api.error",
  apiRequest: "opencode.api.request",
  chatMessage: "opencode.chat.message",
  commandExecuted: "opencode.command.executed",
  configLoaded: "opencode.config.loaded",
  eventReceived: "opencode.event.received",
  fileEdited: "opencode.file.edited",
  gitOperation: "opencode.git.operation",
  permissionAsk: "opencode.permission.ask",
  sessionCreated: "opencode.session.created",
  sessionDiff: "opencode.session.diff",
  sessionError: "opencode.session.error",
  sessionIdle: "opencode.session.idle",
  sessionStatus: "opencode.session.status",
  commandExecuteBefore: "opencode.command.execute.before",
  toolExecuteBefore: "opencode.tool.execute.before",
  toolExecuteAfter: "opencode.tool.execute.after",
} as const;

export type TelemetryEventName =
  (typeof TELEMETRY_EVENT_NAMES)[keyof typeof TELEMETRY_EVENT_NAMES];

export type TelemetryTimestampSource = "clock" | "hook";

export type TelemetryKnownAttributes = {
  additions?: number;
  agent?: string;
  arguments?: string;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  callId?: string;
  command?: string;
  completedAtMs?: number;
  costUsd?: number;
  deletions?: number;
  directory?: string;
  durationMs?: number;
  errorName?: string;
  errorMessage?: string;
  eventType?: string;
  filePath?: string;
  files?: number;
  hasModel?: boolean;
  inputTokens?: number;
  isGitCommit?: boolean;
  isGitPrCreate?: boolean;
  language?: string;
  messageId?: string;
  model?: string;
  operation?: string;
  outputTokens?: number;
  permission?: string;
  promptLength?: number;
  provider?: string;
  reasoningTokens?: number;
  statusCode?: number;
  status?: string;
  success?: boolean;
  nextRetryDelayMs?: number;
  retryAttempt?: number;
  timestampSource?: TelemetryTimestampSource;
  title?: string;
  tool?: string;
  variant?: string;
  worktree?: string;
};

export type TelemetryAttributesInput = TelemetryKnownAttributes &
  Record<string, TelemetryAttributeValue | undefined>;

export type TelemetryRecord = {
  name: TelemetryEventName;
  timestamp: string;
  sessionId?: string;
  attributes: Record<string, TelemetryAttributeValue>;
};

export type TelemetryRecordInput = {
  name: TelemetryEventName;
  nowMs: number;
  sessionId?: string;
  attributes?: TelemetryAttributesInput;
};

const isTelemetryAttributeValue = (
  value: unknown,
): value is TelemetryAttributeValue => {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
};

const assertTelemetryEventName = (name: string): void => {
  if (!name.trim()) {
    throw new Error("Telemetry event name req");
  }
};

const assertTelemetryTimestamp = (nowMs: number): void => {
  if (!Number.isFinite(nowMs)) {
    throw new Error("Telemetry timestamp source invalid");
  }
};

const assertKnownAttributes = (attributes: TelemetryAttributesInput): void => {
  if (
    attributes.durationMs !== undefined &&
    (!Number.isFinite(attributes.durationMs) || attributes.durationMs < 0)
  ) {
    throw new Error("Telemetry durationMs invalid");
  }

  if (
    attributes.timestampSource !== undefined &&
    attributes.timestampSource !== "clock" &&
    attributes.timestampSource !== "hook"
  ) {
    throw new Error("Telemetry timestampSource invalid");
  }
};

export const createTelemetryAttributes = (
  input: TelemetryAttributesInput = {},
): Record<string, TelemetryAttributeValue> => {
  assertKnownAttributes(input);

  const attributes: Record<string, TelemetryAttributeValue> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (!isTelemetryAttributeValue(value)) {
      throw new Error(`Telemetry attribute invalid: ${key}`);
    }

    attributes[key] = value;
  }

  return attributes;
};

export const createTelemetryRecord = (
  input: TelemetryRecordInput,
): TelemetryRecord => {
  assertTelemetryEventName(input.name);
  assertTelemetryTimestamp(input.nowMs);

  return {
    name: input.name,
    timestamp: new Date(input.nowMs).toISOString(),
    sessionId: input.sessionId,
    attributes: createTelemetryAttributes(input.attributes),
  };
};
