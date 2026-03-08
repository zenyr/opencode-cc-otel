type PageId =
  | "overview"
  | "quickstart"
  | "config-model"
  | "first-party"
  | "second-party"
  | "coverage"
  | "runtime"
  | "architecture";

type PageMeta = {
  description: string;
  group: string;
  id: PageId;
  label: string;
  title: string;
};

type ActionLink = {
  href: string;
  label: string;
};

type CodeExample = {
  description: string;
  files?: CodeFile[];
  code?: string;
  title: string;
};

type CodeFile = {
  code: string;
  path: string;
};

type FeatureCard = {
  description: string;
  title: string;
};

type KeyPoint = {
  description: string;
  title: string;
};

type LinkDef = {
  description: string;
  href: string;
  label: string;
};

type PackageRole = {
  description: string;
  name: string;
};

type ParityRow = {
  area: string;
  current: string;
  notes: string;
  status: string;
};

type RowDef = {
  description: string;
  name: string;
  value: string;
};

type StepDef = {
  body: string;
  title: string;
};

const pages: PageMeta[] = [
  {
    description: "Plugin outputs, channels, and known limits.",
    group: "Start Here",
    id: "overview",
    label: "Overview",
    title: "Claude-compatible telemetry for OpenCode",
  },
  {
    description: "Install, configure, verify.",
    group: "Start Here",
    id: "quickstart",
    label: "Quickstart",
    title: "Go from plugin install to first payload",
  },
  {
    description: "Config path, schema, channel model.",
    group: "Start Here",
    id: "config-model",
    label: "Config Model",
    title: "Use channel-aware config as the primary model",
  },
  {
    description: "Anthropic-side HTTP batch setup.",
    group: "Channels",
    id: "first-party",
    label: "First-Party",
    title: "Wire first-party HTTP delivery",
  },
  {
    description: "Team-side sink contract and local delivery guidance.",
    group: "Channels",
    id: "second-party",
    label: "Second-Party",
    title: "Wire second-party sink config",
  },
  {
    description: "Supported outputs and current gaps.",
    group: "Operations",
    id: "coverage",
    label: "Coverage & Gaps",
    title: "Know what is supported and what is not",
  },
  {
    description: "Buffering, retry, replay, fanout.",
    group: "Operations",
    id: "runtime",
    label: "Runtime",
    title: "Understand runtime delivery behavior",
  },
  {
    description: "Monorepo boundaries at a glance.",
    group: "Contributors",
    id: "architecture",
    label: "Repo layout",
    title: "Repository layout for contributors",
  },
];

const pageGroups = Array.from(new Set(pages.map((page) => page.group))).map(
  (group) => ({
    group,
    pages: pages.filter((page) => page.group === group),
  }),
);

const heroActions: ActionLink[] = [
  { href: "#/quickstart", label: "Quickstart" },
  { href: "#/config-model", label: "Channel model" },
  { href: "#/coverage", label: "Coverage & gaps" },
];

const heroSignals: KeyPoint[] = [
  {
    title: "One plugin",
    description: "Register `opencode-cc-otel` in OpenCode.",
  },
  {
    title: "One config file",
    description: "Use `telemetry.jsonc` as the channel-aware contract.",
  },
  {
    title: "One first proof",
    description:
      "Start with 2P `otel-json` over file transport. 1P stays opt-in.",
  },
];

const overviewValueProps: FeatureCard[] = [
  {
    title: "Install as an OpenCode plugin",
    description:
      "Keep setup in OpenCode. Add the plugin, then configure delivery in `telemetry.jsonc`.",
  },
  {
    title: "Claude-compatible payloads stay the contract",
    description:
      "The package aims at Claude-aligned event shapes instead of inventing a new model.",
  },
  {
    title: "Run Anthropic-side and team-side paths independently",
    description:
      "Enable first-party, second-party, or both from the same config file.",
  },
];

const supportSnapshot: FeatureCard[] = [
  {
    title: "First-party (1P)",
    description:
      "Send batch HTTP events to Anthropic-side reporting. Off by default. Turn on only if you need it.",
  },
  {
    title: "Second-party (2P)",
    description:
      "Send Claude-style OTEL JSON to your own tooling. Default local transport is append-only NDJSON file output.",
  },
  {
    title: "Third-party (3P)",
    description:
      "Reserved path only. Unsupported today, kept explicit in config.",
  },
];

const overviewSupportHighlights: FeatureCard[] = [
  {
    title: "Prompt flow and tool activity",
    description:
      "Prompt, command, tool success, API success, API error, and diff metrics are covered where source fields exist.",
  },
  {
    title: "Replay, retry, and fanout",
    description:
      "First-party retry, auth-less 401 retry, replay, and fanout stay explicit instead of hidden behind background magic.",
  },
  {
    title: "Known limits stay explicit",
    description:
      "Session lifecycle, file lifecycle, user-active time, and some first-party events are still partial.",
  },
];

const overviewLimits = [
  "thirdParty forwarding is unsupported and must stay disabled.",
  "Full Claude parity is partial where the OpenCode plugin API does not expose source fields.",
  "secondParty output is Claude-style OTEL JSON, not native OTEL SDK wiring.",
  "Current active-time reporting is CLI command duration, not full user-active time.",
];

const quickStartSteps: StepDef[] = [
  {
    title: "Register the plugin",
    body: "Add `opencode-cc-otel` to OpenCode `plugin` config.",
  },
  {
    title: "Copy the telemetry config",
    body: "Add `telemetry.jsonc` under the XDG config path.",
  },
  {
    title: "Choose a first proof",
    body: "Start with 2P `otel-json` over file transport. Keep 1P HTTP off until you need Anthropic-side reporting.",
  },
];

const quickStartExample: CodeExample = {
  title: "Minimal config files",
  description:
    "Create these two files, then start with 2P `otel-json` over file transport.",
  files: [
    {
      path: "~/.config/opencode/opencode.jsonc",
      code: [
        "{",
        '  "$schema": "https://opencode.ai/config.json",',
        '  "plugin": ["opencode-cc-otel"]',
        "}",
      ].join("\n"),
    },
    {
      path: "~/.config/opencode/telemetry.jsonc",
      code: [
        "{",
        '  "$schema": "https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json",',
        '  "channels": {',
        '    "firstParty": {',
        '      "enabled": false,',
        '      "sink": "http"',
        "    },",
        '    "secondParty": {',
        '      "enabled": true,',
        '      "sink": "otel-json",',
        '      "transport": "file",',
        '      "file": {',
        '        "path": "env:OPENCODE_CC_OTEL_2P_FILE_PATH"',
        "      }",
        "    },",
        '    "thirdParty": {',
        '      "enabled": false',
        "    }",
        "  }",
        "}",
      ].join("\n"),
    },
  ],
};

const quickStartChecks = [
  '`~/.config/opencode/opencode.jsonc` should include `"plugin": ["opencode-cc-otel"]`.',
  "`telemetry.jsonc` should point `$schema` to the published schema URL.",
  'Start with `channels.secondParty = { sink: "otel-json", transport: "file" }`. Leave 1P off until you need Anthropic-side reporting.',
];

const configSurfaces: RowDef[] = [
  {
    name: "SSOT refs doc",
    value: "Source semantics",
    description:
      "Use `refs/telemetry-config-model.md` for channel, sink, and transport terms.",
  },
  {
    name: "XDG config file",
    value: "Primary path",
    description: "Put `telemetry.jsonc` under the OpenCode config dir.",
  },
  {
    name: "Schema URL",
    value: "Editor contract",
    description: "Use it in `$schema` for editor validation.",
  },
];

const channelModelCards: FeatureCard[] = [
  {
    title: "firstParty",
    description: "Anthropic-side reporting via HTTP batch.",
  },
  {
    title: "secondParty",
    description:
      "Team-side reporting via `otel-json`, with explicit transport selection. Default local transport is file/ndjson.",
  },
  {
    title: "thirdParty",
    description: "Reserved. Unsupported. Must stay off.",
  },
];

const configPaths: RowDef[] = [
  {
    name: "$schema",
    value: "published URL",
    description:
      "`https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json`",
  },
  {
    name: "Config file",
    value: "default location",
    description: "`~/.config/opencode/telemetry.jsonc`",
  },
  {
    name: "Override env",
    value: "optional",
    description: "`OPENCODE_CC_OTEL_CONFIG_PATH`",
  },
];

const firstPartyRules: RowDef[] = [
  {
    name: "Sink",
    value: "http",
    description: "First-party reporting only supports HTTP batch delivery.",
  },
  {
    name: "Endpoint",
    value: "required",
    description: "Set `channels.firstParty.http.default.endpoint`.",
  },
  {
    name: "Token",
    value: "optional but typical",
    description: "Use `token` or `env:...` indirection.",
  },
];

const firstPartyEnvVars: RowDef[] = [
  {
    name: "OPENCODE_CC_OTEL_HTTP_TOKEN_1P",
    value: "recommended",
    description: "Token indirection for Anthropic batch auth.",
  },
  {
    name: "OPENCODE_CC_OTEL_HTTP_MAX_ATTEMPTS",
    value: "8",
    description: "Retry cap for transient first-party HTTP failures.",
  },
  {
    name: "OPENCODE_CC_OTEL_HTTP_BACKOFF_MS",
    value: "500",
    description: "Quadratic retry base used with `baseMs * attempts^2`.",
  },
  {
    name: "OPENCODE_CC_OTEL_QUEUE_DIR",
    value: "optional",
    description: "Disk queue for failed batch replay.",
  },
];

const firstPartyExample: CodeExample = {
  title: "Minimal first-party channel",
  description: "Start small. Prove auth and batch acceptance first.",
  code: [
    "{",
    '  "$schema": "https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json",',
    '  "channels": {',
    '    "firstParty": {',
    '      "enabled": true,',
    '      "sink": "http",',
    '      "http": {',
    '        "default": {',
    '          "endpoint": "https://api.anthropic.com/api/event_logging/batch",',
    '          "token": "env:OPENCODE_CC_OTEL_HTTP_TOKEN_1P"',
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n"),
};

const secondPartyTransports: RowDef[] = [
  {
    name: "file",
    value: "default",
    description:
      "Append-only NDJSON file output. Local-safe default for TUI, CI, and replayable inspection.",
  },
  {
    name: "console",
    value: "explicit only",
    description:
      "Direct stdout output. Use only when console delivery is intentionally desired.",
  },
];

const secondPartyAttrs: RowDef[] = [
  {
    name: "serviceName",
    value: "claude-code",
    description: "Overrides `service.name`. Supports `env:NAME`.",
  },
  {
    name: "serviceVersion",
    value: "0.1.0",
    description: "Override `service.version`. Supports `env:NAME`.",
  },
  {
    name: "logsChannelId",
    value: "otel_3p_logs",
    description: "OTEL logs channel id. Can also come from env override.",
  },
  {
    name: "metricsChannelId",
    value: "otel_3p_metrics",
    description: "OTEL metrics channel id. Can also come from env override.",
  },
];

const secondPartyEnvVars: RowDef[] = [
  {
    name: "OPENCODE_CC_OTEL_2P_FILE_PATH",
    value: "XDG data path",
    description: "Optional override for 2P NDJSON file output path.",
  },
  {
    name: "OPENCODE_CC_OTEL_SERVICE_NAME",
    value: "claude-code",
    description: "Fallback service name for `otel-json` output.",
  },
  {
    name: "OPENCODE_CC_OTEL_SERVICE_VERSION",
    value: "0.1.0",
    description: "Fallback service version for `otel-json` output.",
  },
  {
    name: "OPENCODE_CC_OTEL_LOGS_CHANNEL_ID",
    value: "otel_3p_logs",
    description: "Fallback OTEL logs channel id.",
  },
  {
    name: "OPENCODE_CC_OTEL_METRICS_CHANNEL_ID",
    value: "otel_3p_metrics",
    description: "Fallback OTEL metrics channel id.",
  },
];

const secondPartyExample: CodeExample = {
  title: "Second-party OTEL JSON channel",
  description:
    "Use when downstream expects Claude-style OTEL JSON over explicit transport.",
  code: [
    "{",
    '  "$schema": "https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json",',
    '  "channels": {',
    '    "secondParty": {',
    '      "enabled": true,',
    '      "sink": "otel-json",',
    '      "transport": "file",',
    '      "file": {',
    '        "path": "env:OPENCODE_CC_OTEL_2P_FILE_PATH"',
    "      },",
    '      "otel": {',
    '        "serviceName": "claude-code",',
    '        "serviceVersion": "env:OPENCODE_CC_OTEL_SERVICE_VERSION",',
    '        "logsChannelId": "otel_3p_logs",',
    '        "metricsChannelId": "otel_3p_metrics",',
    '        "resourceAttributes": {',
    '          "user.subscription_type": "team"',
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n"),
};

const coverageFamilies: FeatureCard[] = [
  {
    title: "Prompt flow",
    description: "Chat flow maps to Claude-style prompt reporting.",
  },
  {
    title: "API usage and failure",
    description: "API success and error reporting where source fields exist.",
  },
  {
    title: "Commands, tools, and diffs",
    description:
      "Command execution, tool success, permission decisions, and diff metrics.",
  },
];

const emittedOutputs: RowDef[] = [
  {
    name: "1P events",
    value: "batch HTTP",
    description:
      "`tengu_input_prompt`, `tengu_input_command`, `tengu_tool_use_success`, `tengu_api_success`, `tengu_api_error`.",
  },
  {
    name: "2P logs",
    value: "otel-json",
    description:
      "`claude_code.user_prompt`, `claude_code.tool_result`, `claude_code.api_request`, `claude_code.api_error`, `claude_code.tool_decision`.",
  },
  {
    name: "2P metrics",
    value: "otel-json",
    description:
      "`session.count`, `lines_of_code.count`, `pull_request.count`, `commit.count`, `cost.usage`, `token.usage`, `code_edit_tool.decision`, `active_time.total`.",
  },
];

const parityMatrix: ParityRow[] = [
  {
    area: "User prompt events",
    status: "High",
    current: "1P + 2P emitted",
    notes:
      "`tengu_input_prompt` and `claude_code.user_prompt` both emit from `chat.message`.",
  },
  {
    area: "Tool lifecycle",
    status: "Medium-high",
    current: "Success path only",
    notes:
      "1P `tengu_tool_use_success` and 2P `claude_code.tool_result` emit on success. 1P tool error not emitted yet.",
  },
  {
    area: "Permission decisions",
    status: "High",
    current: "2P emitted",
    notes:
      "`claude_code.tool_decision` and `claude_code.code_edit_tool.decision` emit. Decision source stays `unknown` today.",
  },
  {
    area: "API usage and failure",
    status: "High",
    current: "1P + 2P emitted",
    notes:
      "`message.updated` maps to 1P success/error, 2P api request/error, plus cost and token metrics.",
  },
  {
    area: "Token and cost metrics",
    status: "High",
    current: "2P emitted",
    notes:
      "`cost.usage` and `token.usage` emit for input, output, cache read, and cache creation tokens.",
  },
  {
    area: "Diff and LoC metrics",
    status: "High",
    current: "2P emitted",
    notes:
      "`session.diff` maps to added and removed `lines_of_code.count` metrics.",
  },
  {
    area: "Command telemetry",
    status: "Medium-high",
    current: "1P + 2P partial",
    notes:
      "1P `tengu_input_command` emits. `commit.count` and `pull_request.count` use command correlation heuristics.",
  },
  {
    area: "Git-operation 1P events",
    status: "Low",
    current: "Not emitted",
    notes:
      "First-party slash/bash/startup/git-operation event families are still missing.",
  },
  {
    area: "Session count",
    status: "High",
    current: "2P emitted",
    notes: "`session.count` emits from plugin config startup path.",
  },
  {
    area: "Active time",
    status: "Medium",
    current: "CLI-only approximation",
    notes:
      "`active_time.total` derives from command duration only, not full user-active time.",
  },
  {
    area: "Session lifecycle hooks",
    status: "Low",
    current: "Not wired",
    notes:
      "No current mapping for `session.created`, `session.updated`, `session.deleted`, `session.idle`, `session.status`, or `session.error`.",
  },
  {
    area: "File lifecycle hooks",
    status: "Low",
    current: "Not wired",
    notes: "No current mapping for `file.edited` lifecycle coverage.",
  },
  {
    area: "1P HTTP delivery",
    status: "High",
    current: "Implemented",
    notes:
      "Batch envelope, bounded retry/backoff, and auth-less retry after 401 are implemented.",
  },
  {
    area: "Durable replay",
    status: "High",
    current: "Implemented",
    notes:
      "Failed first-party batches can persist to disk and replay on startup.",
  },
  {
    area: "Fanout",
    status: "High",
    current: "Implemented",
    notes:
      "First-party and second-party sinks can run together through fanout composition.",
  },
  {
    area: "2P OTEL JSON",
    status: "High",
    current: "Implemented",
    notes:
      "Claude-style OTEL JSON logs and metrics emit over file or console transport.",
  },
  {
    area: "Native OTEL SDK/exporter parity",
    status: "Low",
    current: "Not implemented",
    notes:
      "Current second-party path uses Claude-style JSON envelopes, not native SDK readers/exporters.",
  },
  {
    area: "Third-party forwarding",
    status: "Low",
    current: "Unsupported",
    notes: "`thirdParty` stays explicit in config but must remain disabled.",
  },
  {
    area: "Segment / Datadog adapters",
    status: "Low",
    current: "Not implemented",
    notes: "No dedicated Segment or Datadog payload formatting exists today.",
  },
  {
    area: "Trace / span parity",
    status: "Low",
    current: "Not implemented",
    notes:
      "No Claude-equivalent trace/span lifecycle is exposed through current plugin wiring.",
  },
  {
    area: "Trust / identity / org policy",
    status: "Low",
    current: "Blocked by plugin surface",
    notes:
      "Claude-internal trust state, org opt-out, identity enrichment, remote config, and feature-flag gates are not exposed.",
  },
];

const knownGaps = [
  "Full Claude parity is still partial where the OpenCode plugin API lacks source fields.",
  "thirdParty forwarding is unsupported and must stay disabled.",
  "secondParty export is Claude-style OTEL JSON, not native OTEL SDK wiring.",
  "firstParty tool error and firstParty slash/bash/startup/git-operation events are not emitted yet.",
  "Session lifecycle and file lifecycle coverage are not wired yet.",
  "`active_time.total` is derived from command duration only, not full user activity.",
  "Commit and pull-request metrics use command correlation heuristics, not canonical success/failure state.",
];

const runtimeBehaviors: FeatureCard[] = [
  {
    title: "Validation first",
    description: "Validate before delivery.",
  },
  {
    title: "Deterministic buffering",
    description: "Buffering is explicit.",
  },
  {
    title: "Bounded retry",
    description: "1P HTTP uses quadratic retry backoff.",
  },
];

const runtimeSettings: RowDef[] = [
  {
    name: "OPENCODE_CC_OTEL_MAX_BATCH_SIZE",
    value: "1",
    description: "App buffer size. Default is near-synchronous.",
  },
  {
    name: "OPENCODE_CC_OTEL_FLUSH_INTERVAL_MS",
    value: "0",
    description: "Reserved policy value.",
  },
  {
    name: "OPENCODE_CC_OTEL_QUEUE_DIR",
    value: "optional",
    description: "Durable queue dir for failed first-party batches.",
  },
];

const verifyCommands = [
  "bun run dev:site",
  "bun run build:site",
  "bun run lint",
  "bun test",
  "curl -I https://zenyr.github.io/opencode-cc-otel/schemas/telemetry.schema.json",
];

const deployChecks = [
  "Keep the schema URL stable.",
  "If the Pages path changes, update schema `$id` and `$schema` refs.",
  "Hash routing keeps deep-link refreshes safe on GitHub Pages.",
  "Publish site and schema from the same Pages root.",
];

const referenceLinks = (schemaHref: string): LinkDef[] => [
  {
    label: "Published schema",
    href: schemaHref,
    description: "Stable editor-validation contract for `telemetry.jsonc`.",
  },
  {
    label: "Repo README",
    href: "https://github.com/zenyr/opencode-cc-otel/blob/main/README.md",
    description: "Goal, channel model, env, verify notes.",
  },
  {
    label: "Example config",
    href: "https://github.com/zenyr/opencode-cc-otel/blob/main/telemetry.jsonc.example",
    description: "Current public config example.",
  },
  {
    label: "Web package",
    href: "https://github.com/zenyr/opencode-cc-otel/tree/main/packages/opencode-cc-otel-web",
    description: "Docs app source package.",
  },
];

const architectureFlow =
  "packages/domain -> packages/application -> packages/adapters -> packages/main";

const packageRoles: PackageRole[] = [
  {
    name: "packages/domain",
    description: "Contracts, attr validation, core rules.",
  },
  {
    name: "packages/application",
    description: "Buffering, publish flow, and explicit flush behavior.",
  },
  {
    name: "packages/adapters",
    description: "HTTP batch, OTEL JSON, console, replay, fanout.",
  },
  {
    name: "packages/main",
    description: "OpenCode hook wiring and runtime composition.",
  },
  {
    name: "packages/opencode-cc-otel-web",
    description: "Public docs surface.",
  },
];

const architectureNotes = [
  "Hexagonal boundaries stay explicit.",
  "The deployable plugin target remains `packages/main`.",
  "Docs should not drift from code, schema, or tests.",
];

export {
  architectureFlow,
  architectureNotes,
  channelModelCards,
  configPaths,
  configSurfaces,
  coverageFamilies,
  deployChecks,
  emittedOutputs,
  parityMatrix,
  firstPartyEnvVars,
  firstPartyExample,
  firstPartyRules,
  heroActions,
  heroSignals,
  knownGaps,
  overviewValueProps,
  overviewSupportHighlights,
  overviewLimits,
  packageRoles,
  pageGroups,
  pages,
  quickStartChecks,
  quickStartExample,
  quickStartSteps,
  referenceLinks,
  runtimeBehaviors,
  runtimeSettings,
  secondPartyAttrs,
  secondPartyEnvVars,
  secondPartyExample,
  secondPartyTransports,
  supportSnapshot,
  verifyCommands,
};
export type {
  ActionLink,
  CodeFile,
  CodeExample,
  FeatureCard,
  KeyPoint,
  LinkDef,
  PackageRole,
  ParityRow,
  PageId,
  PageMeta,
  RowDef,
  StepDef,
};
