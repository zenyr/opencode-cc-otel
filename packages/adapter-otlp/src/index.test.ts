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

const fixturePath = new URL(
  "./fixtures/claude-file-create-metrics.redacted.json",
  import.meta.url,
);

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

const buildClaudeParityMetricRecords = () => {
  return [
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.sessionCount,
      nowMs: 1,
      sessionId: "session-id-redacted",
      unit: "{count}",
      value: 1,
      attributes: {},
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.linesOfCodeCount,
      nowMs: 2,
      sessionId: "session-id-redacted",
      unit: "{count}",
      value: 2,
      attributes: { type: "added" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.linesOfCodeCount,
      nowMs: 3,
      sessionId: "session-id-redacted",
      unit: "{count}",
      value: 0,
      attributes: { type: "removed" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.costUsage,
      nowMs: 4,
      sessionId: "session-id-redacted",
      unit: "USD",
      value: 0.0376665,
      attributes: { model: "claude-opus-4-6" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      nowMs: 5,
      sessionId: "session-id-redacted",
      unit: "tokens",
      value: 4,
      attributes: { model: "claude-opus-4-6", type: "input" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      nowMs: 6,
      sessionId: "session-id-redacted",
      unit: "tokens",
      value: 145,
      attributes: { model: "claude-opus-4-6", type: "output" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      nowMs: 7,
      sessionId: "session-id-redacted",
      unit: "tokens",
      value: 43093,
      attributes: { model: "claude-opus-4-6", type: "cacheRead" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.tokenUsage,
      nowMs: 8,
      sessionId: "session-id-redacted",
      unit: "tokens",
      value: 1996,
      attributes: { model: "claude-opus-4-6", type: "cacheCreation" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.codeEditToolDecision,
      nowMs: 9,
      sessionId: "session-id-redacted",
      unit: "{count}",
      value: 1,
      attributes: {
        decision: "accept",
        source: "user_temporary",
        tool_name: "Write",
        language: "TypeScript",
      },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.activeTimeTotal,
      nowMs: 10,
      sessionId: "session-id-redacted",
      unit: "s",
      value: 9.485,
      attributes: { type: "user" },
    }),
    createTelemetryRecord({
      kind: "metric",
      channel: "secondParty",
      name: TELEMETRY_EVENT_NAMES.secondPartyMetrics.activeTimeTotal,
      nowMs: 11,
      sessionId: "session-id-redacted",
      unit: "s",
      value: 6.416,
      attributes: { type: "cli" },
    }),
  ];
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
            { key: "terminal.type", value: { stringValue: "cli" } },
            { key: "service.instance", value: { stringValue: "flex" } },
            { key: "service.version", value: { stringValue: "2.1.69" } },
            { key: "app.version", value: { stringValue: "2.1.69" } },
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
                  stringValue: "claude_code.tengu_tool_use_success",
                },
                attributes: [
                  {
                    key: "event.name",
                    value: { stringValue: "tengu_tool_use_success" },
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
            { key: "terminal.type", value: { stringValue: "cli" } },
            { key: "service.instance", value: { stringValue: "flex" } },
            { key: "service.version", value: { stringValue: "2.1.69" } },
            { key: "app.version", value: { stringValue: "2.1.69" } },
            { key: "user.account_uuid", value: { stringValue: "acct-1" } },
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
                description: "Number of tokens used",
                unit: "tokens",
                sum: {
                  aggregationTemporality: 1,
                  isMonotonic: true,
                  dataPoints: [
                    {
                      attributes: [
                        {
                          key: "session.id",
                          value: { stringValue: "session-1" },
                        },
                        {
                          key: "app.version",
                          value: { stringValue: "2.1.69" },
                        },
                        {
                          key: "user.account_uuid",
                          value: { stringValue: "acct-1" },
                        },
                        {
                          key: "terminal.type",
                          value: { stringValue: "cli" },
                        },
                        {
                          key: "type",
                          value: { stringValue: "input" },
                        },
                        {
                          key: "model",
                          value: { stringValue: "claude-sonnet-4-6" },
                        },
                      ],
                      startTimeUnixNano: "2000000",
                      timeUnixNano: "2000000",
                      asDouble: 123,
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

test("createOtlpMetricsRequest matches redacted Claude file-create fixture", async () => {
  const fixture = (await Bun.file(fixturePath).json()) as ReturnType<
    typeof createOtlpMetricsRequest
  >;

  expect(
    createOtlpMetricsRequest(buildClaudeParityMetricRecords(), {
      serviceName: "claude",
      serviceVersion: "2.1.72",
      resourceAttributes: {
        "terminal.type": "tmux",
        "service.instance": "service-instance-redacted",
        "service.type": "cli",
        "host.arch": "arm64",
        "os.type": "darwin",
        "os.version": "24.6.0",
        "user.email": "user@example.com",
        "user.id": "user-id-redacted",
        "organization.id": "org-id-redacted",
      },
      scopeName: "com.anthropic.claude_code",
      scopeVersion: "2.1.72",
      includeSessionId: true,
      includeAccountUuid: true,
      accountUuid: "account-uuid-redacted",
    }),
  ).toEqual(fixture);
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
