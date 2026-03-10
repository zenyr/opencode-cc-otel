import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { TelemetrySinkPort } from "@zenyr/telemetry-application";
import type {
  ModelCost,
  ModelPricingPort,
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
  headers?: Record<string, string>;
  timeoutMs?: number;
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

export type TextLineWriter = {
  write: (line: string) => Promise<void>;
};

export type NdjsonFileWriterOptions = {
  path: string;
};

export type SecondPartyOtelSinkOptions = {
  write?: (payload: string) => Promise<void> | void;
  serviceName?: string;
  serviceVersion?: string;
  logsChannelId?: string;
  metricsChannelId?: string;
  nowSequence?: () => number;
  resourceAttributes?: Record<string, string>;
  includeMetricSessionId?: boolean;
  includeMetricVersion?: boolean;
  includeMetricAccountUuid?: boolean;
  accountUuid?: string;
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
const OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE = 2 as const;

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
        event_data: JSON.stringify(
          buildAnthropic1PEventData(event, nowEventId()),
        ),
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
    includeSessionId?: boolean;
    includeVersion?: boolean;
    includeAccountUuid?: boolean;
    accountUuid?: string;
  } = {},
): SecondPartyMetricEnvelope => {
  const resourceAttributes: Record<string, string> = {
    "channel.id": options.channelId ?? DEFAULT_OTEL_METRICS_CHANNEL_ID,
    "service.name": options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME,
    ...options.resourceAttributes,
  };

  if (options.includeVersion !== false) {
    resourceAttributes["service.version"] =
      options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION;
  }

  if (options.includeAccountUuid && options.accountUuid) {
    resourceAttributes["account.uuid"] = options.accountUuid;
  }

  const pointAttributes = Object.fromEntries(
    Object.entries(metric.attributes).map(([key, value]) => {
      return [key, stringifyAttributeValue(value)];
    }),
  );

  if (options.includeSessionId && metric.sessionId) {
    pointAttributes["session.id"] = metric.sessionId;
  }

  return {
    resource_attributes: resourceAttributes,
    metrics: [
      {
        name: metric.name,
        description: metric.description,
        unit: metric.unit,
        data_points: [
          {
            attributes: pointAttributes,
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
          ...options.headers,
          ...(useAuth && options.token
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

export class NdjsonFileWriter implements TextLineWriter {
  #path: string;

  constructor(options: NdjsonFileWriterOptions) {
    if (!options.path) {
      throw new Error("NdjsonFileWriter path req");
    }

    this.#path = options.path;
  }

  async write(line: string): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await appendFile(this.#path, `${line}\n`, "utf8");
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
      JSON.stringify(
        createAnthropic1PBatchEnvelope(filtered, this.#nowEventId),
      ),
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
  #includeMetricSessionId: boolean;
  #includeMetricVersion: boolean;
  #includeMetricAccountUuid: boolean;
  #accountUuid: string | undefined;

  constructor(options: SecondPartyOtelSinkOptions = {}) {
    this.#write = options.write ?? ((payload) => console.log(payload));
    this.#serviceName = options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME;
    this.#serviceVersion =
      options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION;
    this.#logsChannelId = options.logsChannelId ?? DEFAULT_OTEL_LOGS_CHANNEL_ID;
    this.#metricsChannelId =
      options.metricsChannelId ?? DEFAULT_OTEL_METRICS_CHANNEL_ID;
    this.#nowSequence = options.nowSequence ?? (() => Date.now());
    this.#resourceAttributes = options.resourceAttributes ?? {};
    this.#includeMetricSessionId = options.includeMetricSessionId ?? false;
    this.#includeMetricVersion = options.includeMetricVersion ?? true;
    this.#includeMetricAccountUuid = options.includeMetricAccountUuid ?? false;
    this.#accountUuid = options.accountUuid;
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
              includeSessionId: this.#includeMetricSessionId,
              includeVersion: this.#includeMetricVersion,
              includeAccountUuid: this.#includeMetricAccountUuid,
              accountUuid: this.#accountUuid,
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

// ---------------------------------------------------------------------------
// Model pricing cache (models.dev adapter)
// ---------------------------------------------------------------------------

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_CACHE_DIR_SEGMENTS = ["opencode", "telemetry"];
const DEFAULT_CACHE_FILE_NAME = "models-pricing.json";

type ModelsDevProvider = {
  models: Record<string, { cost?: ModelCost }>;
};

type ModelsDevPayload = Record<string, ModelsDevProvider>;

type CachedPricingData = {
  fetchedAtMs: number;
  models: Record<string, ModelCost>;
};

export type ModelPricingCacheOptions = {
  /** Override cache dir (default: $XDG_CACHE_HOME/opencode/telemetry) */
  cacheDir?: string;
  /** TTL in ms (default: 86400000 = 1 day) */
  ttlMs?: number;
  /** Override env for XDG_CACHE_HOME resolution */
  env?: Record<string, string | undefined>;
  /** Override fetch impl */
  fetch?: (url: string) => Promise<Response>;
  /** Override clock */
  nowMs?: () => number;
};

const resolveXdgCacheDir = (
  env?: Record<string, string | undefined>,
): string => {
  const xdg = env?.XDG_CACHE_HOME ?? process.env.XDG_CACHE_HOME;
  return xdg ?? join(homedir(), ".cache");
};

const flattenModelsDevPayload = (
  payload: ModelsDevPayload,
): Record<string, ModelCost> => {
  const result: Record<string, ModelCost> = {};

  for (const provider of Object.values(payload)) {
    if (!provider.models || typeof provider.models !== "object") {
      continue;
    }

    for (const [modelId, model] of Object.entries(provider.models)) {
      if (!model.cost || typeof model.cost.input !== "number") {
        continue;
      }

      result[modelId] = model.cost;
    }
  }

  return result;
};

export class ModelPricingCache implements ModelPricingPort {
  #cacheFilePath: string;
  #ttlMs: number;
  #fetchImpl: (url: string) => Promise<Response>;
  #nowMs: () => number;
  #data: CachedPricingData | undefined;
  #loading: Promise<void> | undefined;

  constructor(options: ModelPricingCacheOptions = {}) {
    const cacheDir =
      options.cacheDir ??
      join(resolveXdgCacheDir(options.env), ...DEFAULT_CACHE_DIR_SEGMENTS);
    this.#cacheFilePath = join(cacheDir, DEFAULT_CACHE_FILE_NAME);
    this.#ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.#fetchImpl = options.fetch ?? ((url) => fetch(url));
    this.#nowMs = options.nowMs ?? (() => Date.now());
  }

  async lookup(modelId: string): Promise<ModelCost | undefined> {
    await this.#ensureLoaded();
    return this.#data?.models[modelId];
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#data && this.#nowMs() - this.#data.fetchedAtMs < this.#ttlMs) {
      return;
    }

    if (this.#loading) {
      await this.#loading;
      return;
    }

    this.#loading = this.#load();

    try {
      await this.#loading;
    } finally {
      this.#loading = undefined;
    }
  }

  async #load(): Promise<void> {
    // try disk cache first
    const cached = await this.#readDiskCache();
    if (cached && this.#nowMs() - cached.fetchedAtMs < this.#ttlMs) {
      this.#data = cached;
      return;
    }

    // fetch fresh
    try {
      const response = await this.#fetchImpl(MODELS_DEV_API_URL);
      if (!response.ok) {
        // fall back to stale cache if available
        if (cached) {
          this.#data = cached;
        }
        return;
      }

      const payload = (await response.json()) as ModelsDevPayload;
      const models = flattenModelsDevPayload(payload);
      const now = this.#nowMs();
      this.#data = { fetchedAtMs: now, models };
      await this.#writeDiskCache(this.#data);
    } catch {
      // network failure — use stale cache
      if (cached) {
        this.#data = cached;
      }
    }
  }

  async #readDiskCache(): Promise<CachedPricingData | undefined> {
    try {
      const file = Bun.file(this.#cacheFilePath);
      const exists = await file.exists();
      if (!exists) {
        return undefined;
      }
      return (await file.json()) as CachedPricingData;
    } catch {
      return undefined;
    }
  }

  async #writeDiskCache(data: CachedPricingData): Promise<void> {
    try {
      await mkdir(dirname(this.#cacheFilePath), { recursive: true });
      await Bun.write(this.#cacheFilePath, JSON.stringify(data));
    } catch {
      // non-critical — cache write failure is silent
    }
  }
}
