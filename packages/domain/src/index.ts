export type TelemetryAttributeValue = string | number | boolean;

export type TelemetryRecord = {
  name: string;
  timestamp: string;
  sessionId?: string;
  attributes: Record<string, TelemetryAttributeValue>;
};

export type TelemetryRecordInput = {
  name: string;
  nowMs: number;
  sessionId?: string;
  attributes?: Record<string, TelemetryAttributeValue | undefined>;
};

export const createTelemetryRecord = (
  input: TelemetryRecordInput,
): TelemetryRecord => {
  const attributes: Record<string, TelemetryAttributeValue> = {};

  for (const [key, value] of Object.entries(input.attributes ?? {})) {
    if (value !== undefined) {
      attributes[key] = value;
    }
  }

  return {
    name: input.name,
    timestamp: new Date(input.nowMs).toISOString(),
    sessionId: input.sessionId,
    attributes,
  };
};
