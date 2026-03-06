import { expect, test } from "bun:test";

import { TelemetryService } from "./index";

test("TelemetryService publishes one event", async () => {
  const sinkCalls: number[] = [];

  const service = new TelemetryService({
    sink: {
      async publish(events) {
        sinkCalls.push(events.length);
      },
    },
    clock: {
      nowMs: () => 1,
    },
  });

  await service.record({
    name: "opencode.tool.execute.before",
    sessionId: "session-1",
    attributes: {
      tool: "edit",
    },
  });

  expect(sinkCalls).toEqual([1]);
});
