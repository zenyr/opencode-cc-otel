import type { TelemetrySinkPort } from "@zenyr/telemetry-application";
import type { TelemetryRecord } from "@zenyr/telemetry-domain";

const FILE_LANGUAGE_MAP = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
]);

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

export const resolveLanguageFromPath = (filePath: string): string | undefined => {
  const dotAt = filePath.lastIndexOf(".");
  if (dotAt === -1) {
    return undefined;
  }

  const extension = filePath.slice(dotAt);
  return FILE_LANGUAGE_MAP.get(extension);
};
