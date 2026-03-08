import {
  type TelemetryAttributeValue,
  type TelemetryAttributesInput,
  type TelemetryEventName,
  type TelemetryRecord,
  createTelemetryRecord,
} from "@zenyr/telemetry-domain";

export interface TelemetrySinkPort {
  publish(events: TelemetryRecord[]): Promise<void>;
}

export interface ClockPort {
  nowMs(): number;
}

export type TelemetryBufferPolicy = {
  maxBatchSize: number;
  flushIntervalMs: number;
};

export const DEFAULT_TELEMETRY_BUFFER_POLICY: TelemetryBufferPolicy = {
  maxBatchSize: 1,
  flushIntervalMs: 0,
};

export type TelemetryServiceDeps = {
  sink: TelemetrySinkPort;
  clock: ClockPort;
  bufferPolicy?: Partial<TelemetryBufferPolicy>;
};

export type RecordTelemetryInput = {
  name: TelemetryEventName;
  sessionId?: string;
  attributes?: TelemetryAttributesInput;
};

const normalizeBufferPolicy = (
  input?: Partial<TelemetryBufferPolicy>,
): TelemetryBufferPolicy => {
  const maxBatchSize =
    input?.maxBatchSize ?? DEFAULT_TELEMETRY_BUFFER_POLICY.maxBatchSize;
  const flushIntervalMs =
    input?.flushIntervalMs ?? DEFAULT_TELEMETRY_BUFFER_POLICY.flushIntervalMs;

  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new Error("Telemetry maxBatchSize invalid");
  }

  if (!Number.isInteger(flushIntervalMs) || flushIntervalMs < 0) {
    throw new Error("Telemetry flushIntervalMs invalid");
  }

  return {
    maxBatchSize,
    flushIntervalMs,
  };
};

export class TelemetryService {
  #sink: TelemetrySinkPort;
  #clock: ClockPort;
  #buffer: TelemetryRecord[] = [];
  #bufferPolicy: TelemetryBufferPolicy;

  constructor(deps: TelemetryServiceDeps) {
    this.#sink = deps.sink;
    this.#clock = deps.clock;
    this.#bufferPolicy = normalizeBufferPolicy(deps.bufferPolicy);
  }

  async record(input: RecordTelemetryInput): Promise<void> {
    this.#buffer.push(
      createTelemetryRecord({
        name: input.name,
        nowMs: this.#clock.nowMs(),
        sessionId: input.sessionId,
        attributes: input.attributes,
      }),
    );

    if (this.#buffer.length >= this.#bufferPolicy.maxBatchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.#buffer.length === 0) {
      return;
    }

    const events = [...this.#buffer];
    await this.#sink.publish(events);
    this.#buffer.splice(0, this.#buffer.length);
  }
}

export class SystemClock implements ClockPort {
  nowMs(): number {
    return Date.now();
  }
}
