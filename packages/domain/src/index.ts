export type TelemetryAttributeValue = string | number | boolean;

export const TELEMETRY_EVENT_NAMES = {
  configLoaded: "opencode.config.loaded",
  eventReceived: "opencode.event.received",
  permissionAsk: "opencode.permission.ask",
  commandExecuteBefore: "opencode.command.execute.before",
  toolExecuteBefore: "opencode.tool.execute.before",
  toolExecuteAfter: "opencode.tool.execute.after",
} as const;

export type TelemetryEventName =
  (typeof TELEMETRY_EVENT_NAMES)[keyof typeof TELEMETRY_EVENT_NAMES];

export type TelemetryTimestampSource = "clock" | "hook";

export type TelemetryKnownAttributes = {
  arguments?: string;
  callId?: string;
  command?: string;
  directory?: string;
  durationMs?: number;
  eventType?: string;
  filePath?: string;
  hasModel?: boolean;
  isGitCommit?: boolean;
  isGitPrCreate?: boolean;
  language?: string;
  permission?: string;
  status?: string;
  timestampSource?: TelemetryTimestampSource;
  title?: string;
  tool?: string;
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
