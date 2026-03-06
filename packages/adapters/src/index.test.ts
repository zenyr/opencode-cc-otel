import { expect, test } from "bun:test";

import {
  TELEMETRY_EVENT_NAMES,
  createTelemetryRecord,
  type TelemetryRecord,
} from "@zenyr/telemetry-domain";
import {
  createNormalizedTelemetryEnvelope,
  DurableTelemetrySink,
  FanoutTelemetrySink,
  HttpTelemetrySink,
  InMemoryTelemetrySink,
  OTelJsonSink,
  RoutingTelemetrySink,
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

test("HttpTelemetrySink does not retry non-retryable status", async () => {
  const sleepCalls: number[] = [];
  let attempts = 0;
  const sink = new HttpTelemetrySink({
    endpoint: "https://telemetry.example.test/events",
    maxAttempts: 3,
    fetch: async () => {
      attempts += 1;
      return new Response("bad req", { status: 400 });
    },
    sleep: async (durationMs) => {
      sleepCalls.push(durationMs);
    },
  });

  await expect(sink.publish([buildRecord()])).rejects.toThrow(
    "HttpTelemetrySink failed after 1 attempts: HTTP 400: bad req",
  );

  expect(attempts).toBe(1);
  expect(sleepCalls).toEqual([]);
});

test("DurableTelemetrySink stores failed batch and replays later", async () => {
  const queueDir = `/tmp/opencode-cc-telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const published: TelemetryRecord[][] = [];
  let shouldFail = true;

  const sink = new DurableTelemetrySink({
    queueDir,
    sink: {
      async publish(events) {
        if (shouldFail) {
          throw new Error("network down");
        }

        published.push(events);
      },
    },
    nowMs: () => 100,
    randomId: () => "batch-1",
  });

  await expect(sink.publish([buildRecord()])).rejects.toThrow("network down");

  shouldFail = false;
  await sink.flushQueued();

  expect(published).toHaveLength(1);
  expect(published[0]).toEqual([buildRecord()]);
  expect(await Bun.file(`${queueDir}/100-batch-1.json`).exists()).toBeFalse();
});

test("DurableTelemetrySink replays queued batches before new publish", async () => {
  const queueDir = `/tmp/opencode-cc-telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const published: TelemetryRecord[][] = [];
  const oldEvent = createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.chatMessage,
    nowMs: 2,
    sessionId: "session-1",
    attributes: {
      promptLength: 5,
    },
  });

  await Bun.write(
    `${queueDir}/050-old.json`,
    JSON.stringify({ events: [oldEvent] }),
  );

  const sink = new DurableTelemetrySink({
    queueDir,
    sink: {
      async publish(events) {
        published.push(events);
      },
    },
  });

  await sink.publish([buildRecord()]);

  expect(published).toEqual([[oldEvent], [buildRecord()]]);
});

test("FanoutTelemetrySink forwards same batch to each sink", async () => {
  const left = new InMemoryTelemetrySink();
  const right = new InMemoryTelemetrySink();
  const sink = new FanoutTelemetrySink({
    sinks: [left, right],
  });
  const event = buildRecord();

  await sink.publish([event]);

  expect(left.drain()).toEqual([event]);
  expect(right.drain()).toEqual([event]);
});

test("createNormalizedTelemetryEnvelope builds portable OTEL-like shape", () => {
  const envelope = createNormalizedTelemetryEnvelope(buildRecord(), {
    sequence: 7,
    serviceName: "opencode-cc-telemetry",
    serviceVersion: "0.2.0",
  });

  expect(envelope).toEqual({
    body: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
    attributes: {
      "channel.id": "otel_3p_logs",
      "event.name": TELEMETRY_EVENT_NAMES.toolExecuteAfter,
      "event.timestamp": "1970-01-01T00:00:00.001Z",
      "event.sequence": "7",
      "service.name": "opencode-cc-telemetry",
      "service.version": "0.2.0",
      "session.id": "session-1",
      tool: "edit",
    },
  });
});

test("OTelJsonSink writes one normalized payload per event", async () => {
  const writes: string[] = [];
  const sink = new OTelJsonSink({
    serviceName: "opencode-cc-telemetry",
    serviceVersion: "0.2.0",
    nowSequence: () => 9,
    write: (payload) => {
      writes.push(payload);
    },
  });

  await sink.publish([buildRecord()]);

  expect(JSON.parse(writes[0] ?? "null")).toEqual({
    body: TELEMETRY_EVENT_NAMES.toolExecuteAfter,
    attributes: {
      "channel.id": "otel_3p_logs",
      "event.name": TELEMETRY_EVENT_NAMES.toolExecuteAfter,
      "event.timestamp": "1970-01-01T00:00:00.001Z",
      "event.sequence": "9",
      "service.name": "opencode-cc-telemetry",
      "service.version": "0.2.0",
      "session.id": "session-1",
      tool: "edit",
    },
  });
});

test("RoutingTelemetrySink groups events by provider", async () => {
  const anthropic = new InMemoryTelemetrySink();
  const openai = new InMemoryTelemetrySink();
  const fallback = new InMemoryTelemetrySink();
  const sink = new RoutingTelemetrySink({
    fallback,
    rules: [
      {
        provider: "anthropic",
        sink: anthropic,
      },
      {
        provider: "openai",
        sink: openai,
      },
    ],
  });
  const defaultEvent = createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.commandExecuted,
    nowMs: 2,
    sessionId: "session-1",
    attributes: {
      command: "git",
    },
  });
  const anthropicEvent = createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.apiRequest,
    nowMs: 3,
    sessionId: "session-1",
    attributes: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    },
  });
  const openaiEvent = createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.apiRequest,
    nowMs: 4,
    sessionId: "session-1",
    attributes: {
      provider: "openai",
      model: "gpt-5",
    },
  });

  await sink.publish([anthropicEvent, defaultEvent, openaiEvent]);

  expect(anthropic.drain()).toEqual([anthropicEvent]);
  expect(openai.drain()).toEqual([openaiEvent]);
  expect(fallback.drain()).toEqual([defaultEvent]);
});

test("RoutingTelemetrySink fails when route missing and no fallback", async () => {
  const sink = new RoutingTelemetrySink({
    rules: [
      {
        provider: "anthropic",
        sink: new InMemoryTelemetrySink(),
      },
    ],
  });
  const event = createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.apiRequest,
    nowMs: 5,
    sessionId: "session-1",
    attributes: {
      provider: "openai",
    },
  });

  await expect(sink.publish([event])).rejects.toThrow(
    "RoutingTelemetrySink route missing for provider: openai",
  );
});

test("createNormalizedTelemetryEnvelope stringifies mixed attrs", () => {
  const event = createTelemetryRecord({
    name: TELEMETRY_EVENT_NAMES.gitOperation,
    nowMs: 3,
    attributes: {
      success: true,
      durationMs: 12,
      operation: "commit",
    },
  });

  expect(createNormalizedTelemetryEnvelope(event).attributes).toMatchObject({
    success: "true",
    durationMs: "12",
    operation: "commit",
  });
});
