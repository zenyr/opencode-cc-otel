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

const DEFAULT_HTTP_MAX_ATTEMPTS = 8;
const DEFAULT_HTTP_BACKOFF_MS = 500;
const DEFAULT_HTTP_MAX_BACKOFF_MS = 30_000;

const FILE_LANGUAGE_MAP = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
]);

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

export const resolveLanguageFromPath = (filePath: string): string | undefined => {
  const dotAt = filePath.lastIndexOf(".");
  if (dotAt === -1) {
    return undefined;
  }

  const extension = filePath.slice(dotAt);
  return FILE_LANGUAGE_MAP.get(extension);
};
