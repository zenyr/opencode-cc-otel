import { expect, test } from "bun:test";

import {
  TELEMETRY_EVENT_NAMES,
  createTelemetryRecord,
} from "@zenyr/telemetry-domain";
import {
  Anthropic1PBatchSink,
  DurableTelemetrySink,
  FanoutTelemetrySink,
  HttpTelemetrySink,
  InMemoryTelemetrySink,
  ModelPricingCache,
  NdjsonFileWriter,
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
    sessionId: "session-1",
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
  const envelope = createAnthropic1PBatchEnvelope(
    [buildFirstPartyRecord()],
    () => {
      return "evt-1";
    },
  );
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
    resourceAttributes: {
      user_email: "dev@company.test",
      userId: "u-123",
    },
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
      user_email: "dev@company.test",
      userId: "u-123",
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

test("createSecondPartyMetricEnvelope honors include flags", () => {
  const metric = buildSecondPartyMetricRecord();
  if (metric.kind !== "metric") {
    throw new Error("metric req");
  }

  expect(
    createSecondPartyMetricEnvelope(metric, {
      serviceName: "claude-code",
      serviceVersion: "2.1.69",
      includeVersion: false,
      includeSessionId: true,
      includeAccountUuid: true,
      accountUuid: "acct-1",
    }),
  ).toEqual({
    resource_attributes: {
      "channel.id": "otel_3p_metrics",
      "service.name": "claude-code",
      "account.uuid": "acct-1",
    },
    metrics: [
      {
        name: "claude_code.token.usage",
        description: undefined,
        unit: "tokens",
        data_points: [
          {
            attributes: {
              "session.id": "session-1",
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

  await sink.publish([
    buildSecondPartyLogRecord(),
    buildSecondPartyMetricRecord(),
  ]);

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

test("NdjsonFileWriter appends one line per payload", async () => {
  const filePath = `/tmp/opencode-cc-telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/otel.ndjson`;
  const writer = new NdjsonFileWriter({ path: filePath });

  await writer.write('{"a":1}');
  await writer.write('{"b":2}');

  expect(await Bun.file(filePath).text()).toBe('{"a":1}\n{"b":2}\n');
});

// ---------------------------------------------------------------------------
// ModelPricingCache
// ---------------------------------------------------------------------------

const FAKE_API_RESPONSE = {
  anthropic: {
    models: {
      "claude-opus-4-6": {
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
      "claude-sonnet-4-6": {
        cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
      },
    },
  },
  openai: {
    models: {
      "gpt-4o": {
        cost: { input: 2.5, output: 10 },
      },
    },
  },
};

const createFakeFetch = (body: unknown = FAKE_API_RESPONSE) => {
  const state = { callCount: 0 };
  const fn = async (_url: string) => {
    state.callCount += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fn, state };
};

const uniqueDir = () =>
  `/tmp/opencode-cc-pricing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test("ModelPricingCache lookups model cost from fetched data", async () => {
  const cacheDir = uniqueDir();
  const { fn, state } = createFakeFetch();
  const cache = new ModelPricingCache({
    cacheDir,
    fetch: fn,
    nowMs: () => 1000,
  });

  const cost = await cache.lookup("claude-opus-4-6");

  expect(cost).toEqual({
    input: 5,
    output: 25,
    cache_read: 0.5,
    cache_write: 6.25,
  });
  expect(state.callCount).toBe(1);
});

test("ModelPricingCache returns undefined for unknown model", async () => {
  const cacheDir = uniqueDir();
  const { fn } = createFakeFetch();
  const cache = new ModelPricingCache({
    cacheDir,
    fetch: fn,
    nowMs: () => 1000,
  });

  expect(await cache.lookup("unknown-model")).toBeUndefined();
});

test("ModelPricingCache serves from memory within TTL", async () => {
  const cacheDir = uniqueDir();
  const { fn, state } = createFakeFetch();
  let now = 1000;
  const cache = new ModelPricingCache({
    cacheDir,
    fetch: fn,
    ttlMs: 60_000,
    nowMs: () => now,
  });

  await cache.lookup("claude-opus-4-6");
  now = 30_000; // 29s later, within TTL
  await cache.lookup("claude-sonnet-4-6");

  expect(state.callCount).toBe(1);
});

test("ModelPricingCache re-fetches after TTL expires", async () => {
  const cacheDir = uniqueDir();
  const { fn, state } = createFakeFetch();
  let now = 1000;
  const cache = new ModelPricingCache({
    cacheDir,
    fetch: fn,
    ttlMs: 60_000,
    nowMs: () => now,
  });

  await cache.lookup("claude-opus-4-6");
  now = 100_000; // well past TTL
  await cache.lookup("claude-opus-4-6");

  expect(state.callCount).toBe(2);
});

test("ModelPricingCache persists to disk and reads back", async () => {
  const cacheDir = uniqueDir();
  const { fn, state } = createFakeFetch();

  // first instance writes to disk
  const cache1 = new ModelPricingCache({
    cacheDir,
    fetch: fn,
    ttlMs: 60_000,
    nowMs: () => 1000,
  });
  await cache1.lookup("gpt-4o");
  expect(state.callCount).toBe(1);

  // second instance reads from disk, no fetch
  const { fn: fn2, state: state2 } = createFakeFetch();
  const cache2 = new ModelPricingCache({
    cacheDir,
    fetch: fn2,
    ttlMs: 60_000,
    nowMs: () => 30_000, // within TTL
  });
  const cost = await cache2.lookup("gpt-4o");

  expect(cost).toEqual({ input: 2.5, output: 10 });
  expect(state2.callCount).toBe(0);
});

test("ModelPricingCache falls back to stale cache on fetch failure", async () => {
  const cacheDir = uniqueDir();
  let now = 1000;

  // seed cache
  const { fn: seedFn } = createFakeFetch();
  const cache1 = new ModelPricingCache({
    cacheDir,
    fetch: seedFn,
    ttlMs: 60_000,
    nowMs: () => now,
  });
  await cache1.lookup("claude-opus-4-6");

  // expire TTL, make fetch fail
  now = 200_000;
  const failFetch = async (_url: string): Promise<Response> => {
    throw new Error("network down");
  };
  const cache2 = new ModelPricingCache({
    cacheDir,
    fetch: failFetch,
    ttlMs: 60_000,
    nowMs: () => now,
  });

  const cost = await cache2.lookup("claude-opus-4-6");
  expect(cost).toEqual({
    input: 5,
    output: 25,
    cache_read: 0.5,
    cache_write: 6.25,
  });
});
