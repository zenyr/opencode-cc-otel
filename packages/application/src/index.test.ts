import { expect, test } from "bun:test";

import {
  TELEMETRY_EVENT_NAMES,
  type TelemetryRecord,
} from "@zenyr/telemetry-domain";
import { TelemetryService } from "./index";

const buildRecordInput = () => {
  return {
    name: TELEMETRY_EVENT_NAMES.toolExecuteBefore,
    sessionId: "session-1",
    attributes: {
      tool: "edit",
    },
  };
};

test("TelemetryService publishes one normalized event", async () => {
  const published: TelemetryRecord[] = [];

  const service = new TelemetryService({
    sink: {
      async publish(events) {
        published.push(...events);
      },
    },
    clock: {
      nowMs: () => 1,
    },
  });

  await service.record(buildRecordInput());

  expect(published).toHaveLength(1);
  expect(published[0]).toEqual({
    name: TELEMETRY_EVENT_NAMES.toolExecuteBefore,
    timestamp: "1970-01-01T00:00:00.001Z",
    sessionId: "session-1",
    attributes: {
      tool: "edit",
    },
  });
});

test("TelemetryService buffers until explicit flush", async () => {
  const publishedBatches: TelemetryRecord[][] = [];

  const service = new TelemetryService({
    sink: {
      async publish(events) {
        publishedBatches.push(events);
      },
    },
    clock: {
      nowMs: () => 1,
    },
    bufferPolicy: {
      maxBatchSize: 2,
      flushIntervalMs: 50,
    },
  });

  await service.record(buildRecordInput());
  expect(publishedBatches).toHaveLength(0);

  await service.flush();

  expect(publishedBatches).toHaveLength(1);
  expect(publishedBatches[0]).toHaveLength(1);
});

test("TelemetryService flushes automatically at maxBatchSize", async () => {
  const publishedBatches: TelemetryRecord[][] = [];
  let nowMs = 0;

  const service = new TelemetryService({
    sink: {
      async publish(events) {
        publishedBatches.push(events);
      },
    },
    clock: {
      nowMs: () => {
        nowMs += 1;
        return nowMs;
      },
    },
    bufferPolicy: {
      maxBatchSize: 2,
    },
  });

  await service.record(buildRecordInput());
  await service.record({
    ...buildRecordInput(),
    name: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
  });

  expect(publishedBatches).toHaveLength(1);
  expect(publishedBatches[0]?.map((event) => event.name)).toEqual([
    TELEMETRY_EVENT_NAMES.toolExecuteBefore,
    TELEMETRY_EVENT_NAMES.toolExecuteAfter,
  ]);
});

test("TelemetryService flush is no-op for empty buffer", async () => {
  const publishedBatches: TelemetryRecord[][] = [];

  const service = new TelemetryService({
    sink: {
      async publish(events) {
        publishedBatches.push(events);
      },
    },
    clock: {
      nowMs: () => 1,
    },
  });

  await service.flush();

  expect(publishedBatches).toEqual([]);
});

test("TelemetryService rejects invalid buffer policy", () => {
  expect(() => {
    new TelemetryService({
      sink: {
        async publish() {},
      },
      clock: {
        nowMs: () => 1,
      },
      bufferPolicy: {
        maxBatchSize: 0,
      },
    });
  }).toThrow("Telemetry maxBatchSize invalid");
});
