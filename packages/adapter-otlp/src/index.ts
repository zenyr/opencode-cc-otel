import type { TelemetrySinkPort } from "@zenyr/telemetry-application";
import type {
  TelemetryAttributeValue,
  TelemetryMetricRecord,
  TelemetryRecord,
} from "@zenyr/telemetry-domain";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit | BunFetchRequestInit,
) => Promise<Response>;

export type OtlpHttpExporterOptions = {
  endpoint: string;
  token?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  fetch?: FetchLike;
  sleep?: (durationMs: number) => Promise<void>;
  logsPath?: string;
  metricsPath?: string;
  serviceName?: string;
  serviceVersion?: string;
  scopeName?: string;
  scopeVersion?: string;
  resourceAttributes?: Record<string, string>;
  includeMetricSessionId?: boolean;
  includeMetricVersion?: boolean;
  includeMetricAccountUuid?: boolean;
  accountUuid?: string;
};

export type OtlpAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number };

export type OtlpKeyValue = {
  key: string;
  value: OtlpAnyValue;
};

export type OtlpResource = {
  attributes: OtlpKeyValue[];
};

export type OtlpInstrumentationScope = {
  name: string;
  version?: string;
};

export type OtlpLogRecord = {
  timeUnixNano: string;
  body: OtlpAnyValue;
  attributes?: OtlpKeyValue[];
};

export type OtlpScopeLogs = {
  scope: OtlpInstrumentationScope;
  logRecords: OtlpLogRecord[];
};

export type OtlpResourceLogs = {
  resource: OtlpResource;
  scopeLogs: OtlpScopeLogs[];
};

export type OtlpExportLogsServiceRequest = {
  resourceLogs: OtlpResourceLogs[];
};

export type OtlpNumberDataPoint = {
  attributes?: OtlpKeyValue[];
  timeUnixNano: string;
  asInt?: string;
  asDouble?: number;
};

export type OtlpMetric = {
  name: string;
  description?: string;
  unit?: string;
  sum: {
    aggregationTemporality: 2;
    isMonotonic: boolean;
    dataPoints: OtlpNumberDataPoint[];
  };
};

export type OtlpScopeMetrics = {
  scope: OtlpInstrumentationScope;
  metrics: OtlpMetric[];
};

export type OtlpResourceMetrics = {
  resource: OtlpResource;
  scopeMetrics: OtlpScopeMetrics[];
};

export type OtlpExportMetricsServiceRequest = {
  resourceMetrics: OtlpResourceMetrics[];
};

export type OtlpExportPartialSuccess = {
  rejectedItems?: number;
  errorMessage?: string;
};

const DEFAULT_HTTP_MAX_ATTEMPTS = 8;
const DEFAULT_HTTP_BACKOFF_MS = 500;
const DEFAULT_HTTP_MAX_BACKOFF_MS = 30_000;
const DEFAULT_OTEL_SERVICE_NAME = "claude-code";
const DEFAULT_OTEL_SERVICE_VERSION = "0.1.0";
const OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE = 2 as const;

const isRetryableStatus = (status: number): boolean => {
  return status === 401 || status === 408 || status === 429 || status >= 500;
};

const createHttpError = (status: number, body: string): Error => {
  const detail = body ? `: ${body}` : "";
  return new Error(`HTTP ${status}${detail}`);
};

const backoffForAttempt = (
  attempt: number,
  backoffMs: number,
  maxBackoffMs: number,
): number => {
  return Math.min(backoffMs * attempt * attempt, maxBackoffMs);
};

const toUnixTimeNano = (timestamp: string): string => {
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? `${ms * 1_000_000}` : "0";
};

const toOtlpAnyValue = (value: TelemetryAttributeValue): OtlpAnyValue => {
  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { boolValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }

  return { stringValue: "null" };
};

const toOtlpKeyValues = (
  attributes: Record<string, TelemetryAttributeValue>,
): OtlpKeyValue[] => {
  return Object.entries(attributes).map(([key, value]) => {
    return {
      key,
      value: toOtlpAnyValue(value),
    };
  });
};

const normalizeHttpEndpoint = (endpoint: string): string => {
  return endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
};

const joinHttpPath = (endpoint: string, path: string): string => {
  const base = normalizeHttpEndpoint(endpoint);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
};

const parseOtlpPartialSuccess = async (
  response: Response,
): Promise<OtlpExportPartialSuccess | undefined> => {
  const body = await response.text();
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const partialSuccess = Reflect.get(parsed, "partialSuccess");
    if (!partialSuccess || typeof partialSuccess !== "object") {
      return undefined;
    }

    const rejectedItems = Reflect.get(partialSuccess, "rejectedItems");
    const errorMessage = Reflect.get(partialSuccess, "errorMessage");

    return {
      rejectedItems:
        typeof rejectedItems === "number" ? rejectedItems : undefined,
      errorMessage: typeof errorMessage === "string" ? errorMessage : undefined,
    };
  } catch {
    return undefined;
  }
};

const createOtlpResourceAttributes = (options: {
  serviceName?: string;
  serviceVersion?: string;
  resourceAttributes?: Record<string, string>;
  includeVersion?: boolean;
  includeAccountUuid?: boolean;
  accountUuid?: string;
}): Record<string, TelemetryAttributeValue> => {
  const attributes: Record<string, TelemetryAttributeValue> = {
    "service.name": options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME,
    ...(options.resourceAttributes ?? {}),
  };

  if (options.includeVersion !== false) {
    attributes["service.version"] =
      options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION;
  }

  if (options.includeAccountUuid && options.accountUuid) {
    attributes["account.uuid"] = options.accountUuid;
  }

  return attributes;
};

export const createOtlpLogsRequest = (
  events: TelemetryRecord[],
  options: {
    serviceName?: string;
    serviceVersion?: string;
    resourceAttributes?: Record<string, string>;
    scopeName?: string;
    scopeVersion?: string;
  } = {},
): OtlpExportLogsServiceRequest => {
  const logRecords = events
    .filter(
      (event) => event.channel === "secondParty" && event.kind === "event",
    )
    .map((event) => {
      const attributes: Record<string, TelemetryAttributeValue> = {
        "event.name": event.name,
        ...event.attributes,
      };

      if (event.sessionId) {
        attributes["session.id"] = event.sessionId;
      }

      return {
        timeUnixNano: toUnixTimeNano(event.timestamp),
        body: { stringValue: event.name },
        attributes: toOtlpKeyValues(attributes),
      };
    });

  return {
    resourceLogs: [
      {
        resource: {
          attributes: toOtlpKeyValues(
            createOtlpResourceAttributes({
              serviceName: options.serviceName,
              serviceVersion: options.serviceVersion,
              resourceAttributes: options.resourceAttributes,
            }),
          ),
        },
        scopeLogs: [
          {
            scope: {
              name: options.scopeName ?? DEFAULT_OTEL_SERVICE_NAME,
              version: options.scopeVersion ?? options.serviceVersion,
            },
            logRecords,
          },
        ],
      },
    ],
  };
};

export const createOtlpMetricsRequest = (
  metrics: TelemetryRecord[],
  options: {
    serviceName?: string;
    serviceVersion?: string;
    resourceAttributes?: Record<string, string>;
    scopeName?: string;
    scopeVersion?: string;
    includeSessionId?: boolean;
    includeVersion?: boolean;
    includeAccountUuid?: boolean;
    accountUuid?: string;
  } = {},
): OtlpExportMetricsServiceRequest => {
  const otlpMetrics = metrics
    .filter((record): record is TelemetryMetricRecord => {
      return record.channel === "secondParty" && record.kind === "metric";
    })
    .map((metric) => {
      const attributes: Record<string, TelemetryAttributeValue> = {
        ...metric.attributes,
      };

      if (options.includeSessionId && metric.sessionId) {
        attributes["session.id"] = metric.sessionId;
      }

      const point: OtlpNumberDataPoint = {
        attributes: toOtlpKeyValues(attributes),
        timeUnixNano: toUnixTimeNano(metric.timestamp),
      };

      if (Number.isInteger(metric.value)) {
        point.asInt = String(metric.value);
      } else {
        point.asDouble = metric.value;
      }

      return {
        name: metric.name,
        description: metric.description,
        unit: metric.unit,
        sum: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE,
          isMonotonic: false,
          dataPoints: [point],
        },
      };
    });

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: toOtlpKeyValues(
            createOtlpResourceAttributes({
              serviceName: options.serviceName,
              serviceVersion: options.serviceVersion,
              resourceAttributes: options.resourceAttributes,
              includeVersion: options.includeVersion,
              includeAccountUuid: options.includeAccountUuid,
              accountUuid: options.accountUuid,
            }),
          ),
        },
        scopeMetrics: [
          {
            scope: {
              name: options.scopeName ?? DEFAULT_OTEL_SERVICE_NAME,
              version: options.scopeVersion ?? options.serviceVersion,
            },
            metrics: otlpMetrics,
          },
        ],
      },
    ],
  };
};

const publishOtlpJsonWithRetry = async (
  options: OtlpHttpExporterOptions,
  body: string,
): Promise<void> => {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((durationMs) => Bun.sleep(durationMs));
  const maxAttempts = options.maxAttempts ?? DEFAULT_HTTP_MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_HTTP_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_HTTP_MAX_BACKOFF_MS;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...options.headers,
          ...(options.token
            ? {
                authorization: `Bearer ${options.token}`,
              }
            : {}),
        },
        body,
        signal:
          options.timeoutMs && options.timeoutMs > 0
            ? AbortSignal.timeout(options.timeoutMs)
            : undefined,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const error = createHttpError(response.status, responseBody);

        if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
          throw new Error(
            `OtlpHttpExporter failed after ${attempt} attempts: ${error.message}`,
          );
        }

        lastError = error;
      } else {
        const partialSuccess = await parseOtlpPartialSuccess(response);
        if ((partialSuccess?.rejectedItems ?? 0) > 0) {
          throw new Error(
            `OtlpHttpExporter partial success rejected ${partialSuccess?.rejectedItems}: ${partialSuccess?.errorMessage ?? "unknown"}`,
          );
        }

        return;
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      if (
        normalizedError.message.startsWith("OtlpHttpExporter failed after") ||
        attempt === maxAttempts
      ) {
        throw new Error(
          `OtlpHttpExporter failed after ${attempt} attempts: ${normalizedError.message}`,
        );
      }

      lastError = normalizedError;
    }

    await sleep(backoffForAttempt(attempt, backoffMs, maxBackoffMs));
  }

  throw new Error(
    `OtlpHttpExporter failed after ${maxAttempts} attempts: ${lastError?.message ?? "unknown"}`,
  );
};

export class OtlpHttpTelemetrySink implements TelemetrySinkPort {
  #options: OtlpHttpExporterOptions;

  constructor(options: OtlpHttpExporterOptions) {
    if (!options.endpoint) {
      throw new Error("OtlpHttpTelemetrySink endpoint req");
    }

    this.#options = options;
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    const secondParty = events.filter(
      (event) => event.channel === "secondParty",
    );
    if (secondParty.length === 0) {
      return;
    }

    const logs = secondParty.filter((event) => event.kind === "event");
    if (logs.length > 0) {
      await publishOtlpJsonWithRetry(
        {
          ...this.#options,
          endpoint: joinHttpPath(
            this.#options.endpoint,
            this.#options.logsPath ?? "/v1/logs",
          ),
        },
        JSON.stringify(
          createOtlpLogsRequest(logs, {
            serviceName: this.#options.serviceName,
            serviceVersion: this.#options.serviceVersion,
            resourceAttributes: this.#options.resourceAttributes,
            scopeName: this.#options.scopeName,
            scopeVersion: this.#options.scopeVersion,
          }),
        ),
      );
    }

    const metrics = secondParty.filter((event) => event.kind === "metric");
    if (metrics.length > 0) {
      await publishOtlpJsonWithRetry(
        {
          ...this.#options,
          endpoint: joinHttpPath(
            this.#options.endpoint,
            this.#options.metricsPath ?? "/v1/metrics",
          ),
        },
        JSON.stringify(
          createOtlpMetricsRequest(metrics, {
            serviceName: this.#options.serviceName,
            serviceVersion: this.#options.serviceVersion,
            resourceAttributes: this.#options.resourceAttributes,
            scopeName: this.#options.scopeName,
            scopeVersion: this.#options.scopeVersion,
            includeSessionId: this.#options.includeMetricSessionId,
            includeVersion: this.#options.includeMetricVersion,
            includeAccountUuid: this.#options.includeMetricAccountUuid,
            accountUuid: this.#options.accountUuid,
          }),
        ),
      );
    }
  }
}
