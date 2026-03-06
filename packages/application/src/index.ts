import {
  createTelemetryRecord,
  type TelemetryAttributeValue,
  type TelemetryRecord,
} from "@zenyr/telemetry-domain";

export interface TelemetrySinkPort {
  publish(events: TelemetryRecord[]): Promise<void>;
}

export interface ClockPort {
  nowMs(): number;
}

export type TelemetryServiceDeps = {
  sink: TelemetrySinkPort;
  clock: ClockPort;
};

export type RecordTelemetryInput = {
  name: string;
  sessionId?: string;
  attributes?: Record<string, TelemetryAttributeValue | undefined>;
};

export class TelemetryService {
  #sink: TelemetrySinkPort;
  #clock: ClockPort;

  constructor(deps: TelemetryServiceDeps) {
    this.#sink = deps.sink;
    this.#clock = deps.clock;
  }

  async record(input: RecordTelemetryInput): Promise<void> {
    await this.#sink.publish([
      createTelemetryRecord({
        name: input.name,
        nowMs: this.#clock.nowMs(),
        sessionId: input.sessionId,
        attributes: input.attributes,
      }),
    ]);
  }
}

export class SystemClock implements ClockPort {
  nowMs(): number {
    return Date.now();
  }
}
