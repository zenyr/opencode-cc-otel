import { expect, test } from "bun:test";

import { createTelemetryRecord } from "./index";

test("createTelemetryRecord builds normalized payload", () => {
  const event = createTelemetryRecord({
    name: "opencode.tool.execute.after",
    nowMs: 1,
    sessionId: "session-1",
    attributes: {
      tool: "edit",
      durationMs: 10,
      dropMe: undefined,
    },
  });

  expect(event.name).toBe("opencode.tool.execute.after");
  expect(event.attributes.dropMe).toBeUndefined();
});
