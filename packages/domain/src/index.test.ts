import { expect, test } from "bun:test";

import {
  TELEMETRY_EVENT_NAMES,
  createTelemetryAttributes,
  createTelemetryRecord,
} from "./index";

test("TELEMETRY_EVENT_NAMES exposes Claude-compatible event constants", () => {
  expect(TELEMETRY_EVENT_NAMES.firstParty.inputPrompt).toBe(
    "tengu_input_prompt",
  );
  expect(TELEMETRY_EVENT_NAMES.firstParty.apiSuccess).toBe("tengu_api_success");
  expect(TELEMETRY_EVENT_NAMES.secondParty.userPrompt).toBe(
    "claude_code.user_prompt",
  );
  expect(TELEMETRY_EVENT_NAMES.secondParty.toolResult).toBe(
    "claude_code.tool_result",
  );
  expect(TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage).toBe(
    "claude_code.token.usage",
  );
});

test("createTelemetryRecord builds second-party event payload", () => {
  const event = createTelemetryRecord({
    channel: "secondParty",
    name: TELEMETRY_EVENT_NAMES.secondParty.toolResult,
    nowMs: 1,
    sessionId: "session-1",
    attributes: {
      tool_name: "edit",
      duration_ms: 10,
      dropMe: undefined,
    },
  });

  expect(event).toEqual({
    kind: "event",
    channel: "secondParty",
    name: "claude_code.tool_result",
    timestamp: "1970-01-01T00:00:00.001Z",
    sessionId: "session-1",
    attributes: {
      tool_name: "edit",
      duration_ms: 10,
    },
  });
});

test("createTelemetryRecord builds second-party metric payload", () => {
  const metric = createTelemetryRecord({
    kind: "metric",
    channel: "secondParty",
    name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
    nowMs: 2,
    unit: "tokens",
    value: 123,
    attributes: {
      type: "input",
      model: "claude-sonnet-4-6",
    },
  });

  expect(metric).toEqual({
    kind: "metric",
    channel: "secondParty",
    name: "claude_code.token.usage",
    timestamp: "1970-01-01T00:00:00.002Z",
    attributes: {
      type: "input",
      model: "claude-sonnet-4-6",
    },
    unit: "tokens",
    value: 123,
    description: undefined,
  });
});

test("createTelemetryRecord rejects invalid input early", () => {
  expect(() => {
    createTelemetryRecord({
      channel: "secondParty",
      name: "",
      nowMs: Number.NaN,
    });
  }).toThrow("Telemetry event name req");
});

test("createTelemetryAttributes keeps primitive attrs only", () => {
  expect(
    createTelemetryAttributes({
      tool_name: "edit",
      duration_ms: 25,
      success: true,
      error: null,
      dropMe: undefined,
    }),
  ).toEqual({
    tool_name: "edit",
    duration_ms: 25,
    success: true,
    error: null,
  });
});

test("createTelemetryAttributes rejects non-primitive attr values", () => {
  expect(() => {
    createTelemetryAttributes({
      custom: { nested: true } as unknown as string,
    });
  }).toThrow("Telemetry attribute invalid: custom");
});
