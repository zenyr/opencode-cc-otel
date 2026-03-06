import { expect, test } from "bun:test";

import {
  createTelemetryAttributes,
  createTelemetryRecord,
  TELEMETRY_EVENT_NAMES,
} from "./index";

const buildRecordInput = () => {
  return {
    name: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
    nowMs: 1,
    sessionId: "session-1",
    attributes: {
      tool: "edit",
      durationMs: 10,
      dropMe: undefined,
    },
  };
};

test("TELEMETRY_EVENT_NAMES exposes shared event constants", () => {
  expect(TELEMETRY_EVENT_NAMES.toolExecuteAfter).toBe(
    "opencode.tool.execute.after",
  );
  expect(TELEMETRY_EVENT_NAMES.permissionAsk).toBe("opencode.permission.ask");
  expect(TELEMETRY_EVENT_NAMES.apiRequest).toBe("opencode.api.request");
  expect(TELEMETRY_EVENT_NAMES.sessionDiff).toBe("opencode.session.diff");
  expect(TELEMETRY_EVENT_NAMES.commandExecuted).toBe("opencode.command.executed");
  expect(TELEMETRY_EVENT_NAMES.fileEdited).toBe("opencode.file.edited");
  expect(TELEMETRY_EVENT_NAMES.gitOperation).toBe("opencode.git.operation");
  expect(TELEMETRY_EVENT_NAMES.sessionCreated).toBe("opencode.session.created");
  expect(TELEMETRY_EVENT_NAMES.sessionError).toBe("opencode.session.error");
  expect(TELEMETRY_EVENT_NAMES.sessionIdle).toBe("opencode.session.idle");
  expect(TELEMETRY_EVENT_NAMES.sessionStatus).toBe("opencode.session.status");
});

test("createTelemetryRecord builds normalized payload", () => {
  const event = createTelemetryRecord(buildRecordInput());

  expect(event.name).toBe(TELEMETRY_EVENT_NAMES.toolExecuteAfter);
  expect(event.timestamp).toBe("1970-01-01T00:00:00.001Z");
  expect(event.attributes.dropMe).toBeUndefined();
});

test("createTelemetryRecord rejects invalid input early", () => {
  expect(() => {
    createTelemetryRecord({
      name: "" as (typeof TELEMETRY_EVENT_NAMES)[keyof typeof TELEMETRY_EVENT_NAMES],
      nowMs: Number.NaN,
    });
  }).toThrow("Telemetry event name req");
});

test("createTelemetryAttributes keeps known and unknown attrs normalized", () => {
  expect(
    createTelemetryAttributes({
      tool: "edit",
      durationMs: 25,
      language: "typescript",
      timestampSource: "hook",
      customFlag: true,
      dropMe: undefined,
    }),
  ).toEqual({
    tool: "edit",
    durationMs: 25,
    language: "typescript",
    timestampSource: "hook",
    customFlag: true,
  });
});

test("createTelemetryAttributes rejects invalid timestamp source", () => {
  expect(() => {
    createTelemetryAttributes({
      timestampSource: "wall-clock" as "clock",
    });
  }).toThrow("Telemetry timestampSource invalid");
});

test("createTelemetryAttributes rejects invalid durationMs", () => {
  expect(() => {
    createTelemetryAttributes({
      durationMs: -1,
    });
  }).toThrow("Telemetry durationMs invalid");
});

test("createTelemetryAttributes rejects non-primitive attr values", () => {
  expect(() => {
    createTelemetryAttributes({
      custom: { nested: true } as unknown as string,
    });
  }).toThrow("Telemetry attribute invalid: custom");
});
