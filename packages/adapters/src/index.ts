import { mkdir, readdir, rm } from "node:fs/promises";
import type { TelemetrySinkPort } from "@zenyr/telemetry-application";
import type {
  TelemetryMetricRecord,
  TelemetryRecord,
} from "@zenyr/telemetry-domain";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit | BunFetchRequestInit,
) => Promise<Response>;

export type HttpTelemetrySinkOptions = {
  endpoint: string;
  token?: string;
  maxAttempts?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  fetch?: FetchLike;
  sleep?: (durationMs: number) => Promise<void>;
};

export type Anthropic1PBatchSinkOptions = HttpTelemetrySinkOptions & {
  nowEventId?: () => string;
};

export type DurableTelemetrySinkOptions = {
  sink: TelemetrySinkPort;
  queueDir: string;
  nowMs?: () => number;
  randomId?: () => string;
};

export type FanoutTelemetrySinkOptions = {
  sinks: TelemetrySinkPort[];
};

export type SecondPartyOtelSinkOptions = {
  write?: (payload: string) => Promise<void> | void;
  serviceName?: string;
  serviceVersion?: string;
  logsChannelId?: string;
  metricsChannelId?: string;
  nowSequence?: () => number;
  resourceAttributes?: Record<string, string>;
};

export type SecondPartyLogEnvelope = {
  body: string;
  attributes: Record<string, string>;
};

export type SecondPartyMetricEnvelope = {
  resource_attributes: Record<string, string>;
  metrics: Array<{
    name: string;
    description?: string;
    unit: string;
    data_points: Array<{
      attributes: Record<string, string>;
      value: number;
      timestamp: string;
    }>;
  }>;
};

type Anthropic1PBatchEnvelope = {
  events: Array<{
    event_type: "ClaudeCodeInternalEvent";
    event_data: string;
  }>;
};

const DEFAULT_HTTP_MAX_ATTEMPTS = 8;
const DEFAULT_HTTP_BACKOFF_MS = 500;
const DEFAULT_HTTP_MAX_BACKOFF_MS = 30_000;
const DEFAULT_OTEL_LOGS_CHANNEL_ID = "otel_3p_logs";
const DEFAULT_OTEL_METRICS_CHANNEL_ID = "otel_3p_metrics";
const DEFAULT_OTEL_SERVICE_NAME = "claude-code";
const DEFAULT_OTEL_SERVICE_VERSION = "0.1.0";

const FILE_LANGUAGE_MAP = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
]);

const queueFilePath = (queueDir: string, fileName: string): string => {
  return `${queueDir}/${fileName}`;
};

const sortQueueFiles = (fileNames: string[]): string[] => {
  return [...fileNames].sort((left, right) => left.localeCompare(right));
};

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

const stringifyAttributeValue = (
  value: TelemetryRecord["attributes"][string],
): string => {
  return String(value);
};

const shortEventName = (name: string): string => {
  const dotAt = name.lastIndexOf(".");
  return dotAt === -1 ? name : name.slice(dotAt + 1);
};

const buildAnthropic1PEventData = (
  event: TelemetryRecord,
  eventId: string,
): Record<string, unknown> => {
  return {
    event_id: eventId,
    event_name: event.name,
    client_timestamp: event.timestamp,
    session_id: event.sessionId,
    ...event.attributes,
    additional_metadata: JSON.stringify(event.attributes),
  };
};

export const createAnthropic1PBatchEnvelope = (
  events: TelemetryRecord[],
  nowEventId: () => string = () => crypto.randomUUID(),
): Anthropic1PBatchEnvelope => {
  return {
    events: events.map((event) => {
      return {
        event_type: "ClaudeCodeInternalEvent",
        event_data: JSON.stringify(buildAnthropic1PEventData(event, nowEventId())),
      };
    }),
  };
};

export const createSecondPartyLogEnvelope = (
  event: TelemetryRecord,
  options: {
    channelId?: string;
    sequence?: number;
    serviceName?: string;
    serviceVersion?: string;
  } = {},
): SecondPartyLogEnvelope => {
  const attributes: Record<string, string> = {
    "channel.id": options.channelId ?? DEFAULT_OTEL_LOGS_CHANNEL_ID,
    "event.name": shortEventName(event.name),
    "event.timestamp": event.timestamp,
    "service.name": options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME,
    "service.version": options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION,
  };

  if (event.sessionId) {
    attributes["session.id"] = event.sessionId;
  }

  if (options.sequence !== undefined) {
    attributes["event.sequence"] = String(options.sequence);
  }

  for (const [key, value] of Object.entries(event.attributes)) {
    attributes[key] = stringifyAttributeValue(value);
  }

  return {
    body: event.name,
    attributes,
  };
};

export const createSecondPartyMetricEnvelope = (
  metric: TelemetryMetricRecord,
  options: {
    channelId?: string;
    serviceName?: string;
    serviceVersion?: string;
    resourceAttributes?: Record<string, string>;
  } = {},
): SecondPartyMetricEnvelope => {
  return {
    resource_attributes: {
      "channel.id": options.channelId ?? DEFAULT_OTEL_METRICS_CHANNEL_ID,
      "service.name": options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME,
      "service.version": options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION,
      ...options.resourceAttributes,
    },
    metrics: [
      {
        name: metric.name,
        description: metric.description,
        unit: metric.unit,
        data_points: [
          {
            attributes: Object.fromEntries(
              Object.entries(metric.attributes).map(([key, value]) => {
                return [key, stringifyAttributeValue(value)];
              }),
            ),
            value: metric.value,
            timestamp: metric.timestamp,
          },
        ],
      },
    ],
  };
};

const publishJsonWithRetry = async (
  options: HttpTelemetrySinkOptions,
  body: string,
  allowAuthless401Retry = false,
): Promise<void> => {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((durationMs) => Bun.sleep(durationMs));
  const maxAttempts = options.maxAttempts ?? DEFAULT_HTTP_MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_HTTP_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_HTTP_MAX_BACKOFF_MS;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const useAuth = !(allowAuthless401Retry && attempt === 2);

    try {
      const response = await fetchImpl(options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(useAuth && options.token
            ? {
                authorization: `Bearer ${options.token}`,
              }
            : {}),
        },
        body,
      });

      if (response.ok) {
        return;
      }

      const responseBody = await response.text();
      const error = createHttpError(response.status, responseBody);

      if (
        allowAuthless401Retry &&
        response.status === 401 &&
        options.token &&
        attempt === 1
      ) {
        lastError = error;
        continue;
      }

      if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
        throw new Error(
          `HttpTelemetrySink failed after ${attempt} attempts: ${error.message}`,
        );
      }

      lastError = error;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      if (
        normalizedError.message.startsWith("HttpTelemetrySink failed after") ||
        attempt === maxAttempts
      ) {
        throw new Error(
          `HttpTelemetrySink failed after ${attempt} attempts: ${normalizedError.message}`,
        );
      }

      lastError = normalizedError;
    }

    await sleep(backoffForAttempt(attempt, backoffMs, maxBackoffMs));
  }

  throw new Error(
    `HttpTelemetrySink failed after ${maxAttempts} attempts: ${lastError?.message ?? "unknown"}`,
  );
};

export class ConsoleTelemetrySink implements TelemetrySinkPort {
  async publish(events: TelemetryRecord[]): Promise<void> {
    for (const event of events) {
      console.log(JSON.stringify(event));
    }
  }
}

export class InMemoryTelemetrySink implements TelemetrySinkPort {
  #events: TelemetryRecord[] = [];

  async publish(events: TelemetryRecord[]): Promise<void> {
    this.#events.push(...events);
  }

  drain(): TelemetryRecord[] {
    const snapshot = this.#events;
    this.#events = [];
    return snapshot;
  }
}

export class HttpTelemetrySink implements TelemetrySinkPort {
  #options: HttpTelemetrySinkOptions;

  constructor(options: HttpTelemetrySinkOptions) {
    if (!options.endpoint) {
      throw new Error("HttpTelemetrySink endpoint req");
    }

    this.#options = options;
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await publishJsonWithRetry(
      this.#options,
      JSON.stringify({ events }),
      false,
    );
  }
}

export class Anthropic1PBatchSink implements TelemetrySinkPort {
  #options: Anthropic1PBatchSinkOptions;
  #nowEventId: () => string;

  constructor(options: Anthropic1PBatchSinkOptions) {
    if (!options.endpoint) {
      throw new Error("Anthropic1PBatchSink endpoint req");
    }

    this.#options = options;
    this.#nowEventId = options.nowEventId ?? (() => crypto.randomUUID());
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    const filtered = events.filter((event) => event.channel === "firstParty");
    if (filtered.length === 0) {
      return;
    }

    await publishJsonWithRetry(
      this.#options,
      JSON.stringify(createAnthropic1PBatchEnvelope(filtered, this.#nowEventId)),
      true,
    );
  }
}

export class DurableTelemetrySink implements TelemetrySinkPort {
  #sink: TelemetrySinkPort;
  #queueDir: string;
  #nowMs: () => number;
  #randomId: () => string;

  constructor(options: DurableTelemetrySinkOptions) {
    if (!options.queueDir) {
      throw new Error("DurableTelemetrySink queueDir req");
    }

    this.#sink = options.sink;
    this.#queueDir = options.queueDir;
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#randomId =
      options.randomId ?? (() => Math.random().toString(36).slice(2, 10));
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await this.#ensureQueueDir();
    await this.#replayQueuedBatches();

    try {
      await this.#sink.publish(events);
    } catch (error) {
      await this.#enqueue(events);
      throw error;
    }
  }

  async flushQueued(): Promise<void> {
    await this.#ensureQueueDir();
    await this.#replayQueuedBatches();
  }

  async #ensureQueueDir(): Promise<void> {
    await mkdir(this.#queueDir, { recursive: true });
  }

  async #readQueueFileNames(): Promise<string[]> {
    const entries = await readdir(this.#queueDir, { withFileTypes: true });
    return sortQueueFiles(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name),
    );
  }

  async #enqueue(events: TelemetryRecord[]): Promise<void> {
    const fileName = `${this.#nowMs()}-${this.#randomId()}.json`;
    const filePath = queueFilePath(this.#queueDir, fileName);
    await Bun.write(filePath, JSON.stringify({ events }));
  }

  async #replayQueuedBatches(): Promise<void> {
    for (const fileName of await this.#readQueueFileNames()) {
      const filePath = queueFilePath(this.#queueDir, fileName);
      const payload = (await Bun.file(filePath).json()) as {
        events?: TelemetryRecord[];
      };
      const events = Array.isArray(payload.events) ? payload.events : [];

      if (events.length === 0) {
        await rm(filePath, { force: true });
        continue;
      }

      await this.#sink.publish(events);
      await rm(filePath, { force: true });
    }
  }
}

export class FanoutTelemetrySink implements TelemetrySinkPort {
  #sinks: TelemetrySinkPort[];

  constructor(options: FanoutTelemetrySinkOptions) {
    if (options.sinks.length === 0) {
      throw new Error("FanoutTelemetrySink sinks req");
    }

    this.#sinks = options.sinks;
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    for (const sink of this.#sinks) {
      await sink.publish(events);
    }
  }
}

export class SecondPartyOtelSink implements TelemetrySinkPort {
  #write: (payload: string) => Promise<void> | void;
  #serviceName: string;
  #serviceVersion: string;
  #logsChannelId: string;
  #metricsChannelId: string;
  #nowSequence: () => number;
  #resourceAttributes: Record<string, string>;

  constructor(options: SecondPartyOtelSinkOptions = {}) {
    this.#write = options.write ?? ((payload) => console.log(payload));
    this.#serviceName = options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME;
    this.#serviceVersion =
      options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION;
    this.#logsChannelId =
      options.logsChannelId ?? DEFAULT_OTEL_LOGS_CHANNEL_ID;
    this.#metricsChannelId =
      options.metricsChannelId ?? DEFAULT_OTEL_METRICS_CHANNEL_ID;
    this.#nowSequence = options.nowSequence ?? (() => Date.now());
    this.#resourceAttributes = options.resourceAttributes ?? {};
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    for (const event of events) {
      if (event.channel !== "secondParty") {
        continue;
      }

      if (event.kind === "metric") {
        await this.#write(
          JSON.stringify(
            createSecondPartyMetricEnvelope(event, {
              channelId: this.#metricsChannelId,
              serviceName: this.#serviceName,
              serviceVersion: this.#serviceVersion,
              resourceAttributes: this.#resourceAttributes,
            }),
          ),
        );
        continue;
      }

      await this.#write(
        JSON.stringify(
          createSecondPartyLogEnvelope(event, {
            channelId: this.#logsChannelId,
            sequence: this.#nowSequence(),
            serviceName: this.#serviceName,
            serviceVersion: this.#serviceVersion,
          }),
        ),
      );
    }
  }
}

export const resolveLanguageFromPath = (
  filePath: string,
): string | undefined => {
  const dotAt = filePath.lastIndexOf(".");
  if (dotAt === -1) {
    return undefined;
  }

  const extension = filePath.slice(dotAt);
  return FILE_LANGUAGE_MAP.get(extension);
};
