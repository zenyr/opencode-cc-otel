import { mkdir, readdir, rm } from "node:fs/promises";
import type { TelemetrySinkPort } from "@zenyr/telemetry-application";
import type { TelemetryRecord } from "@zenyr/telemetry-domain";

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

export type DurableTelemetrySinkOptions = {
  sink: TelemetrySinkPort;
  queueDir: string;
  nowMs?: () => number;
  randomId?: () => string;
};

export type FanoutTelemetrySinkOptions = {
  sinks: TelemetrySinkPort[];
};

export type OTelJsonSinkOptions = {
  write?: (payload: string) => Promise<void> | void;
  serviceName?: string;
  serviceVersion?: string;
  channelId?: string;
  nowSequence?: () => number;
};

export type RoutingTelemetryRule = {
  match: (event: TelemetryRecord) => boolean;
  sink: TelemetrySinkPort;
};

export type RoutingTelemetrySinkOptions = {
  rules: RoutingTelemetryRule[];
  fallback?: TelemetrySinkPort;
};

export type NormalizedTelemetryEnvelope = {
  body: string;
  attributes: Record<string, string>;
};

const DEFAULT_HTTP_MAX_ATTEMPTS = 8;
const DEFAULT_HTTP_BACKOFF_MS = 500;
const DEFAULT_HTTP_MAX_BACKOFF_MS = 30_000;
const DEFAULT_OTEL_CHANNEL_ID = "otel_3p_logs";
const DEFAULT_OTEL_SERVICE_NAME = "opencode-cc";
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
  return status === 408 || status === 429 || status >= 500;
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

const stringifyAttributeValue = (value: TelemetryRecord["attributes"][string]): string => {
  return String(value);
};

export const createNormalizedTelemetryEnvelope = (
  event: TelemetryRecord,
  options: {
    channelId?: string;
    sequence?: number;
    serviceName?: string;
    serviceVersion?: string;
  } = {},
): NormalizedTelemetryEnvelope => {
  const attributes: Record<string, string> = {
    "channel.id": options.channelId ?? DEFAULT_OTEL_CHANNEL_ID,
    "event.name": event.name,
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
  #endpoint: string;
  #token?: string;
  #maxAttempts: number;
  #backoffMs: number;
  #maxBackoffMs: number;
  #fetch: FetchLike;
  #sleep: (durationMs: number) => Promise<void>;

  constructor(options: HttpTelemetrySinkOptions) {
    if (!options.endpoint) {
      throw new Error("HttpTelemetrySink endpoint req");
    }

    this.#endpoint = options.endpoint;
    this.#token = options.token;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_HTTP_MAX_ATTEMPTS;
    this.#backoffMs = options.backoffMs ?? DEFAULT_HTTP_BACKOFF_MS;
    this.#maxBackoffMs = options.maxBackoffMs ?? DEFAULT_HTTP_MAX_BACKOFF_MS;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((durationMs) => Bun.sleep(durationMs));
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        const response = await this.#fetch(this.#endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.#token
              ? {
                  authorization: `Bearer ${this.#token}`,
                }
              : {}),
          },
          body: JSON.stringify({ events }),
        });

        if (response.ok) {
          return;
        }

        const body = await response.text();
        const error = createHttpError(response.status, body);

        if (!isRetryableStatus(response.status) || attempt === this.#maxAttempts) {
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
          attempt === this.#maxAttempts
        ) {
          throw new Error(
            `HttpTelemetrySink failed after ${attempt} attempts: ${normalizedError.message}`,
          );
        }

        lastError = normalizedError;
      }

      await this.#sleep(
        backoffForAttempt(attempt, this.#backoffMs, this.#maxBackoffMs),
      );
    }

    throw new Error(
      `HttpTelemetrySink failed after ${this.#maxAttempts} attempts: ${lastError?.message ?? "unknown"}`,
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

export class OTelJsonSink implements TelemetrySinkPort {
  #write: (payload: string) => Promise<void> | void;
  #serviceName: string;
  #serviceVersion: string;
  #channelId: string;
  #nowSequence: () => number;

  constructor(options: OTelJsonSinkOptions = {}) {
    this.#write = options.write ?? ((payload) => console.log(payload));
    this.#serviceName = options.serviceName ?? DEFAULT_OTEL_SERVICE_NAME;
    this.#serviceVersion = options.serviceVersion ?? DEFAULT_OTEL_SERVICE_VERSION;
    this.#channelId = options.channelId ?? DEFAULT_OTEL_CHANNEL_ID;
    this.#nowSequence = options.nowSequence ?? (() => Date.now());
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    for (const event of events) {
      const payload = createNormalizedTelemetryEnvelope(event, {
        channelId: this.#channelId,
        sequence: this.#nowSequence(),
        serviceName: this.#serviceName,
        serviceVersion: this.#serviceVersion,
      });

      await this.#write(JSON.stringify(payload));
    }
  }
}

export class RoutingTelemetrySink implements TelemetrySinkPort {
  #fallback?: TelemetrySinkPort;
  #rules: RoutingTelemetryRule[];

  constructor(options: RoutingTelemetrySinkOptions) {
    if (options.rules.length === 0) {
      throw new Error("RoutingTelemetrySink rules req");
    }

    this.#fallback = options.fallback;
    this.#rules = options.rules;
  }

  async publish(events: TelemetryRecord[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const grouped = new Map<TelemetrySinkPort, TelemetryRecord[]>();

    for (const event of events) {
      const sink = this.#route(event);
      const batch = grouped.get(sink);

      if (batch) {
        batch.push(event);
        continue;
      }

      grouped.set(sink, [event]);
    }

    for (const [sink, batch] of grouped) {
      await sink.publish(batch);
    }
  }

  #route(event: TelemetryRecord): TelemetrySinkPort {
    for (const rule of this.#rules) {
      if (rule.match(event)) {
        return rule.sink;
      }
    }

    if (this.#fallback) {
      return this.#fallback;
    }

    throw new Error("RoutingTelemetrySink route missing for event");
  }
}

export const resolveLanguageFromPath = (filePath: string): string | undefined => {
  const dotAt = filePath.lastIndexOf(".");
  if (dotAt === -1) {
    return undefined;
  }

  const extension = filePath.slice(dotAt);
  return FILE_LANGUAGE_MAP.get(extension);
};
