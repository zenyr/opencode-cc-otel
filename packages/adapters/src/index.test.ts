import { expect, test } from "bun:test";

import {
  TELEMETRY_EVENT_NAMES,
  createTelemetryRecord,
} from "@zenyr/telemetry-domain";
import {
  HttpTelemetrySink,
  InMemoryTelemetrySink,
  resolveLanguageFromPath,
} from "./index";

const buildRecord = () => {
  return createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
    nowMs: 1,
    sessionId: "session-1",
    attributes: {
      tool: "edit",
    },
  });
};

test("resolveLanguageFromPath maps extension", () => {
  expect(resolveLanguageFromPath("src/main.ts")).toBe("typescript");
  expect(resolveLanguageFromPath("src/main.unknown")).toBeUndefined();
});

test("InMemoryTelemetrySink stores telemetry records unchanged", async () => {
  const sink = new InMemoryTelemetrySink();
  const event = buildRecord();

  await sink.publish([event]);

  expect(sink.drain()).toEqual([event]);
});

test("HttpTelemetrySink retries transient failures then succeeds", async () => {
  const sleepCalls: number[] = [];
  const fetchCalls: RequestInit[] = [];
  let attempts = 0;

  const sink = new HttpTelemetrySink({
    endpoint: "https://telemetry.example.test/events",
    token: "secret",
    maxAttempts: 3,
    fetch: async (_input, init) => {
      attempts += 1;
      fetchCalls.push(init ?? {});

      if (attempts === 1) {
        return new Response("busy", { status: 503 });
      }

      return new Response(null, { status: 202 });
    },
    sleep: async (durationMs) => {
      sleepCalls.push(durationMs);
    },
  });

  await sink.publish([buildRecord()]);

  expect(attempts).toBe(2);
  expect(sleepCalls).toEqual([500]);
  expect(fetchCalls[0]?.headers).toEqual({
    "content-type": "application/json",
    authorization: "Bearer secret",
  });
});

test("HttpTelemetrySink fails clearly after bounded retries", async () => {
  const sink = new HttpTelemetrySink({
    endpoint: "https://telemetry.example.test/events",
    maxAttempts: 2,
    fetch: async () => {
      throw new Error("network down");
    },
    sleep: async () => {},
  });

  await expect(sink.publish([buildRecord()])).rejects.toThrow(
    "HttpTelemetrySink failed after 2 attempts",
  );
});
