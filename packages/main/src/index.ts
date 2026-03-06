import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { ConsoleTelemetrySink, resolveLanguageFromPath } from "@zenyr/telemetry-adapters";
import {
  SystemClock,
  TelemetryService,
  type TelemetrySinkPort,
} from "@zenyr/telemetry-application";

type RuntimeOptions = {
  sink?: TelemetrySinkPort;
};

type ToolCallState = {
  startedAtMs: number;
  tool: string;
};

const readString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const getProp = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return Reflect.get(value, key);
};

const metadataFilePath = (metadata: unknown): string | undefined => {
  const filediff = getProp(metadata, "filediff");
  const fileFromDiff = readString(getProp(filediff, "file"));
  if (fileFromDiff) {
    return fileFromDiff;
  }

  return readString(getProp(metadata, "filepath"));
};

export const createOpencodeHooks = (
  input: PluginInput,
  options: RuntimeOptions = {},
): Hooks => {
  const service = new TelemetryService({
    sink: options.sink ?? new ConsoleTelemetrySink(),
    clock: new SystemClock(),
  });
  const toolCalls = new Map<string, ToolCallState>();

  return {
    config: async (config) => {
      await service.record({
        name: "opencode.config.loaded",
        attributes: {
          directory: input.directory,
          worktree: input.worktree,
          hasModel: Boolean(getProp(config, "model")),
        },
      });
    },

    event: async ({ event }) => {
      await service.record({
        name: "opencode.event.received",
        attributes: {
          eventType: readString(getProp(event, "type")) ?? "unknown",
        },
      });
    },

    "permission.ask": async (permission, output) => {
      await service.record({
        name: "opencode.permission.ask",
        sessionId: readString(getProp(permission, "sessionID")),
        attributes: {
          status: output.status,
          permission: readString(getProp(permission, "permission")) ?? "unknown",
        },
      });
    },

    "command.execute.before": async (commandInput) => {
      const isGitCommit =
        commandInput.command === "git" && commandInput.arguments.includes("commit");
      const isGitPrCreate =
        commandInput.command === "gh" && commandInput.arguments.includes("pr create");

      await service.record({
        name: "opencode.command.execute.before",
        sessionId: commandInput.sessionID,
        attributes: {
          command: commandInput.command,
          arguments: commandInput.arguments,
          isGitCommit,
          isGitPrCreate,
        },
      });
    },

    "tool.execute.before": async (toolInput) => {
      toolCalls.set(toolInput.callID, {
        startedAtMs: Date.now(),
        tool: toolInput.tool,
      });

      await service.record({
        name: "opencode.tool.execute.before",
        sessionId: toolInput.sessionID,
        attributes: {
          tool: toolInput.tool,
          callId: toolInput.callID,
        },
      });
    },

    "tool.execute.after": async (toolInput, toolOutput) => {
      const state = toolCalls.get(toolInput.callID);
      toolCalls.delete(toolInput.callID);

      const durationMs = state ? Math.max(0, Date.now() - state.startedAtMs) : 0;
      const filePath = metadataFilePath(toolOutput.metadata);
      const language = filePath ? resolveLanguageFromPath(filePath) : undefined;

      await service.record({
        name: "opencode.tool.execute.after",
        sessionId: toolInput.sessionID,
        attributes: {
          tool: toolInput.tool,
          callId: toolInput.callID,
          durationMs,
          filePath,
          language,
          title: toolOutput.title,
        },
      });
    },
  };
};

const plugin: Plugin = async (input) => {
  return createOpencodeHooks(input);
};

export default plugin;
