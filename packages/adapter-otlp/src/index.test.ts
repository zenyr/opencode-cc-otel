import { expect, test } from "bun:test";

import {
  TELEMETRY_EVENT_NAMES,
  createTelemetryRecord,
} from "@zenyr/telemetry-domain";
import {
  OtlpHttpTelemetrySink,
  createOtlpLogsRequest,
  createOtlpMetricsRequest,
} from "./index";

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

test("createOtlpLogsRequest builds official OTLP logs payload shape", () => {
  expect(
    createOtlpLogsRequest([buildSecondPartyLogRecord()], {
      serviceName: "claude-code",
      serviceVersion: "2.1.69",
      resourceAttributes: {
        "service.instance": "flex",
      },
      scopeName: "opencode-cc-otel",
      scopeVersion: "0.2.0",
    }),
  ).toEqual({
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "claude-code" } },
            { key: "service.instance", value: { stringValue: "flex" } },
            { key: "service.version", value: { stringValue: "2.1.69" } },
          ],
        },
        scopeLogs: [
          {
            scope: {
              name: "opencode-cc-otel",
              version: "0.2.0",
            },
            logRecords: [
              {
                timeUnixNano: "1000000",
                body: {
                  stringValue: "claude_code.tool_result",
                },
                attributes: [
                  {
                    key: "event.name",
                    value: { stringValue: "claude_code.tool_result" },
                  },
                  {
                    key: "tool_name",
                    value: { stringValue: "edit" },
                  },
                  {
                    key: "success",
                    value: { boolValue: true },
                  },
                  {
                    key: "session.id",
                    value: { stringValue: "session-1" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
});

test("createOtlpMetricsRequest builds official OTLP metrics payload shape", () => {
  expect(
    createOtlpMetricsRequest([buildSecondPartyMetricRecord()], {
      serviceName: "claude-code",
      serviceVersion: "2.1.69",
      resourceAttributes: {
        "service.instance": "flex",
      },
      scopeName: "opencode-cc-otel",
      scopeVersion: "0.2.0",
      includeSessionId: true,
      includeAccountUuid: true,
      accountUuid: "acct-1",
    }),
  ).toEqual({
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "claude-code" } },
            { key: "service.instance", value: { stringValue: "flex" } },
            { key: "service.version", value: { stringValue: "2.1.69" } },
            { key: "account.uuid", value: { stringValue: "acct-1" } },
          ],
        },
        scopeMetrics: [
          {
            scope: {
              name: "opencode-cc-otel",
              version: "0.2.0",
            },
            metrics: [
              {
                name: "claude_code.token.usage",
                description: undefined,
                unit: "tokens",
                sum: {
                  aggregationTemporality: 2,
                  isMonotonic: false,
                  dataPoints: [
                    {
                      attributes: [
                        {
                          key: "type",
                          value: { stringValue: "input" },
                        },
                        {
                          key: "model",
                          value: { stringValue: "claude-sonnet-4-6" },
                        },
                        {
                          key: "session.id",
                          value: { stringValue: "session-1" },
                        },
                      ],
                      timeUnixNano: "2000000",
                      asInt: "123",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });
});

test("OtlpHttpTelemetrySink posts logs and metrics to OTLP endpoints", async () => {
  const calls: Array<{
    input: RequestInfo | URL;
    init?: RequestInit | BunFetchRequestInit;
  }> = [];
  const sink = new OtlpHttpTelemetrySink({
    endpoint: "https://collector.example.test",
    serviceName: "claude-code",
    serviceVersion: "2.1.69",
    includeMetricSessionId: true,
    fetch: async (input, init) => {
      calls.push({ input, init });
      return new Response("{}", { status: 200 });
    },
    sleep: async () => {},
  });

  await sink.publish([
    buildSecondPartyLogRecord(),
    buildSecondPartyMetricRecord(),
  ]);

  expect(calls).toHaveLength(2);
  expect(String(calls[0]?.input)).toBe(
    "https://collector.example.test/v1/logs",
  );
  expect(String(calls[1]?.input)).toBe(
    "https://collector.example.test/v1/metrics",
  );
  expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
    resourceLogs: expect.any(Array),
  });
  expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
    resourceMetrics: expect.any(Array),
  });
});
