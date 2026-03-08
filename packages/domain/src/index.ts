export type TelemetryAttributeValue = string | number | boolean | null;

export const TELEMETRY_EVENT_NAMES = {
  firstParty: {
    apiError: "tengu_api_error",
    apiSuccess: "tengu_api_success",
    inputCommand: "tengu_input_command",
    inputPrompt: "tengu_input_prompt",
    toolUseError: "tengu_tool_use_error",
    toolUseSuccess: "tengu_tool_use_success",
  },
  secondParty: {
    apiError: "claude_code.api_error",
    apiRequest: "claude_code.api_request",
    toolDecision: "claude_code.tool_decision",
    toolResult: "claude_code.tool_result",
    userPrompt: "claude_code.user_prompt",
  },
  secondPartyMetrics: {
    activeTimeTotal: "claude_code.active_time.total",
    codeEditToolDecision: "claude_code.code_edit_tool.decision",
    commitCount: "claude_code.commit.count",
    costUsage: "claude_code.cost.usage",
    linesOfCodeCount: "claude_code.lines_of_code.count",
    pullRequestCount: "claude_code.pull_request.count",
    sessionCount: "claude_code.session.count",
    tokenUsage: "claude_code.token.usage",
  },
} as const;

export type TelemetryChannel = "firstParty" | "secondParty";
export type TelemetryRecordKind = "event" | "metric";
export type TelemetryMetricUnit = "{count}" | "USD" | "tokens" | "s";

export type TelemetryAttributes = Record<string, TelemetryAttributeValue>;

export type TelemetryBaseRecord = {
  channel: TelemetryChannel;
  name: string;
  timestamp: string;
  sessionId?: string;
  attributes: TelemetryAttributes;
};

export type TelemetryEventRecord = TelemetryBaseRecord & {
  kind: "event";
};

export type TelemetryMetricRecord = TelemetryBaseRecord & {
  kind: "metric";
  description?: string;
  unit: TelemetryMetricUnit;
  value: number;
};

export type TelemetryRecord = TelemetryEventRecord | TelemetryMetricRecord;

type TelemetryRecordBaseInput = {
  channel: TelemetryChannel;
  name: string;
  nowMs: number;
  sessionId?: string;
  attributes?: Record<string, TelemetryAttributeValue | undefined>;
};

export type TelemetryEventRecordInput = TelemetryRecordBaseInput & {
  kind?: "event";
};

export type TelemetryMetricRecordInput = TelemetryRecordBaseInput & {
  kind: "metric";
  description?: string;
  unit: TelemetryMetricUnit;
  value: number;
};

export type TelemetryRecordInput =
  | TelemetryEventRecordInput
  | TelemetryMetricRecordInput;

const isTelemetryAttributeValue = (
  value: unknown,
): value is TelemetryAttributeValue => {
  return (
    value === null ||
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

const assertTelemetryChannel = (channel: TelemetryChannel): void => {
  if (channel !== "firstParty" && channel !== "secondParty") {
    throw new Error("Telemetry channel invalid");
  }
};

const assertTelemetryMetric = (input: TelemetryMetricRecordInput): void => {
  if (!Number.isFinite(input.value)) {
    throw new Error("Telemetry metric value invalid");
  }
};

export const createTelemetryAttributes = (
  input: Record<string, TelemetryAttributeValue | undefined> = {},
): TelemetryAttributes => {
  const attributes: TelemetryAttributes = {};

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
  assertTelemetryChannel(input.channel);
  assertTelemetryEventName(input.name);
  assertTelemetryTimestamp(input.nowMs);

  if (input.kind === "metric") {
    assertTelemetryMetric(input);

    return {
      kind: "metric",
      channel: input.channel,
      name: input.name,
      timestamp: new Date(input.nowMs).toISOString(),
      sessionId: input.sessionId,
      attributes: createTelemetryAttributes(input.attributes),
      description: input.description,
      unit: input.unit,
      value: input.value,
    };
  }

  return {
    kind: "event",
    channel: input.channel,
    name: input.name,
    timestamp: new Date(input.nowMs).toISOString(),
    sessionId: input.sessionId,
    attributes: createTelemetryAttributes(input.attributes),
  };
};
