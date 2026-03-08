import { expect, test } from "bun:test";

import { TELEMETRY_EVENT_NAMES, createTelemetryRecord } from "@zenyr/telemetry-domain";
import {
  Anthropic1PBatchSink,
  DurableTelemetrySink,
  FanoutTelemetrySink,
  HttpTelemetrySink,
  InMemoryTelemetrySink,
  SecondPartyOtelSink,
  createAnthropic1PBatchEnvelope,
  createSecondPartyLogEnvelope,
  createSecondPartyMetricEnvelope,
  resolveLanguageFromPath,
} from "./index";

const buildFirstPartyRecord = () => {
  return createTelemetryRecord({
    channel: "firstParty",
    name: TELEMETRY_EVENT_NAMES.firstParty.apiSuccess,
    nowMs: 1,
    sessionId: "session-1",
    attributes: {
      model: "claude-sonnet-4-6",
      costUSD: 0.25,
    },
  });
};

const buildSecondPartyLogRecord = () => {
  return createTelemetryRecord({
    channel: "secondParty",
    name: TELEMETRY_EVENT_NAMES.secondParty.toolResult,
    nowMs: 1,
    sessionId: "session-1",
    attributes: {
      tool_name: "edit",
      success: true,
    },
  });
};

const buildSecondPartyMetricRecord = () => {
  return createTelemetryRecord({
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
};

test("resolveLanguageFromPath maps extension", () => {
  expect(resolveLanguageFromPath("src/main.ts")).toBe("typescript");
  expect(resolveLanguageFromPath("src/main.unknown")).toBeUndefined();
});

test("InMemoryTelemetrySink stores telemetry records unchanged", async () => {
  const sink = new InMemoryTelemetrySink();
  const event = buildSecondPartyLogRecord();

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

  await sink.publish([buildSecondPartyLogRecord()]);

  expect(attempts).toBe(2);
  expect(sleepCalls).toEqual([500]);
  expect(fetchCalls[0]?.headers).toEqual({
    "content-type": "application/json",
    authorization: "Bearer secret",
  });
});

test("Anthropic1PBatchSink retries 401 once without auth", async () => {
  const authHeaders: Array<string | null> = [];
  let attempts = 0;
  const sink = new Anthropic1PBatchSink({
    endpoint: "https://api.anthropic.test/api/event_logging/batch",
    token: "secret",
    maxAttempts: 3,
    fetch: async (_input, init) => {
      attempts += 1;
      const headers = new Headers(init?.headers);
      authHeaders.push(headers.get("authorization"));
      if (attempts === 1) {
        return new Response("expired", { status: 401 });
      }

      return new Response(null, { status: 202 });
    },
    sleep: async () => {},
    nowEventId: () => "evt-1",
  });

  await sink.publish([buildFirstPartyRecord()]);

  expect(attempts).toBe(2);
  expect(authHeaders).toEqual(["Bearer secret", null]);
});

test("DurableTelemetrySink stores failed batch and replays later", async () => {
  const queueDir = `/tmp/opencode-cc-telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const published = [] as unknown[];
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

  await expect(sink.publish([buildFirstPartyRecord()])).rejects.toThrow(
    "network down",
  );

  shouldFail = false;
  await sink.flushQueued();

  expect(published).toHaveLength(1);
  expect(published[0]).toEqual([buildFirstPartyRecord()]);
  expect(await Bun.file(`${queueDir}/100-batch-1.json`).exists()).toBeFalse();
});

test("FanoutTelemetrySink forwards same batch to each sink", async () => {
  const left = new InMemoryTelemetrySink();
  const right = new InMemoryTelemetrySink();
  const sink = new FanoutTelemetrySink({
    sinks: [left, right],
  });
  const event = buildSecondPartyLogRecord();

  await sink.publish([event]);

  expect(left.drain()).toEqual([event]);
  expect(right.drain()).toEqual([event]);
});

test("createAnthropic1PBatchEnvelope builds Claude batch shape", () => {
  const envelope = createAnthropic1PBatchEnvelope([buildFirstPartyRecord()], () => {
    return "evt-1";
  });
  const item = envelope.events[0];

  expect(item?.event_type).toBe("ClaudeCodeInternalEvent");
  expect(JSON.parse(item?.event_data ?? "null")).toMatchObject({
    event_id: "evt-1",
    event_name: "tengu_api_success",
    client_timestamp: "1970-01-01T00:00:00.001Z",
    session_id: "session-1",
    model: "claude-sonnet-4-6",
  });
});

test("createSecondPartyLogEnvelope builds Claude-compatible OTEL log shape", () => {
  const envelope = createSecondPartyLogEnvelope(buildSecondPartyLogRecord(), {
    sequence: 7,
    serviceName: "claude-code",
    serviceVersion: "2.1.69",
  });

  expect(envelope).toEqual({
    body: "claude_code.tool_result",
    attributes: {
      "channel.id": "otel_3p_logs",
      "event.name": "tool_result",
      "event.timestamp": "1970-01-01T00:00:00.001Z",
      "event.sequence": "7",
      "service.name": "claude-code",
      "service.version": "2.1.69",
      "session.id": "session-1",
      tool_name: "edit",
      success: "true",
    },
  });
});

test("createSecondPartyMetricEnvelope builds Claude-compatible OTEL metric shape", () => {
  const metric = buildSecondPartyMetricRecord();
  if (metric.kind !== "metric") {
    throw new Error("metric req");
  }

  expect(
    createSecondPartyMetricEnvelope(metric, {
      serviceName: "claude-code",
      serviceVersion: "2.1.69",
      resourceAttributes: {
        "user.subscription_type": "team",
      },
    }),
  ).toEqual({
    resource_attributes: {
      "channel.id": "otel_3p_metrics",
      "service.name": "claude-code",
      "service.version": "2.1.69",
      "user.subscription_type": "team",
    },
    metrics: [
      {
        name: "claude_code.token.usage",
        description: undefined,
        unit: "tokens",
        data_points: [
          {
            attributes: {
              type: "input",
              model: "claude-sonnet-4-6",
            },
            value: 123,
            timestamp: "1970-01-01T00:00:00.002Z",
          },
        ],
      },
    ],
  });
});

test("SecondPartyOtelSink writes one payload per event or metric", async () => {
  const writes: string[] = [];
  const sink = new SecondPartyOtelSink({
    serviceName: "claude-code",
    serviceVersion: "2.1.69",
    nowSequence: () => 9,
    write: (payload) => {
      writes.push(payload);
    },
  });

  await sink.publish([buildSecondPartyLogRecord(), buildSecondPartyMetricRecord()]);

  expect(JSON.parse(writes[0] ?? "null")).toEqual({
    body: "claude_code.tool_result",
    attributes: {
      "channel.id": "otel_3p_logs",
      "event.name": "tool_result",
      "event.timestamp": "1970-01-01T00:00:00.001Z",
      "event.sequence": "9",
      "service.name": "claude-code",
      "service.version": "2.1.69",
      "session.id": "session-1",
      tool_name: "edit",
      success: "true",
    },
  });

  expect(JSON.parse(writes[1] ?? "null")).toEqual({
    resource_attributes: {
      "channel.id": "otel_3p_metrics",
      "service.name": "claude-code",
      "service.version": "2.1.69",
    },
    metrics: [
      {
        name: "claude_code.token.usage",
        description: undefined,
        unit: "tokens",
        data_points: [
          {
            attributes: {
              type: "input",
              model: "claude-sonnet-4-6",
            },
            value: 123,
            timestamp: "1970-01-01T00:00:00.002Z",
          },
        ],
      },
    ],
  });
});
