# OpenCode Plugin Architecture & Hook System

## Overview

OpenCode implements a comprehensive, type-safe plugin system enabling runtime customization of LLM behavior, tool execution, authentication, and telemetry without modifying core code. The system uses a middleware-pattern hook architecture with immutable inputs and mutable outputs.

## Plugin Definition Model

### Plugin Input Context

```typescript
type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>  // SDK client instance
  project: Project                                   // Current project metadata
  directory: string                                  // Project directory path
  worktree: string                                   // Git worktree root
  serverUrl: URL                                     // Local server URL
  $: BunShell                                        // Shell execution interface
}
```

### Plugin Function Signature

```typescript
type Plugin = (input: PluginInput) => Promise<Hooks>
```

Plugins are async functions returning a Hooks object containing zero or more hook implementations.

## Hook System Overview

OpenCode provides 17+ lifecycle hooks organized into categories:

### Core Hooks (4)

- `permission.ask` - Override permission decisions
- `tool.execute.before` - Intercept and modify tool arguments pre-execution
- `tool.execute.after` - Process tool results and metadata post-execution
- `tool.definition` - Modify tool descriptions and parameters sent to LLM

### Chat/LLM Hooks (3)

- `chat.message` - Intercept user messages
- `chat.params` - Customize LLM parameters (temperature, topP, topK)
- `chat.headers` - Inject custom HTTP headers for LLM API calls

### Shell/Environment Hooks (1)

- `shell.env` - Customize environment variables for shell commands

### Initialization Hooks (2)

- `config` - Called at startup with configuration
- `auth` - Define authentication methods (OAuth/API key)

### Event & Tool Definition Hooks (2)

- `event` - Receive all system events
- `tool` - Define custom tools available to agent

### Experimental Hooks (4)

- `experimental.chat.messages.transform` - Transform all chat messages before processing
- `experimental.chat.system.transform` - Customize system prompts
- `experimental.session.compacting` - Configure session history compression
- `experimental.text.complete` - Provide text completion for message parts

## Detailed Hook Specifications

### permission.ask Hook

**Signature:**
```typescript
"permission.ask"?: (
  input: Permission,
  output: {
    status: "ask" | "deny" | "allow"
  }
) => Promise<void>
```

**Status Values:**
- `"ask"` - Prompt user for permission
- `"deny"` - Deny permission silently
- `"allow"` - Grant permission automatically

**Use Cases:**
- Implement custom permission policies
- Auto-grant safe operations
- Block high-risk tools

---

### tool.execute.before Hook

**Signature:**
```typescript
"tool.execute.before"?: (
  input: {
    tool: string           // Tool name
    sessionID: string      // Current session
    callID: string         // Unique call identifier
  },
  output: {
    args: any              // Tool arguments (mutable)
  }
) => Promise<void>
```

**Key Characteristics:**
- Called before actual tool execution
- `output.args` is **mutable** - direct object mutation applies
- Modified args passed directly to tool execution
- Must pass original Zod schema validation

**Use Cases:**
- Validate/transform tool arguments
- Inject security filters
- Add context-aware modifications
- Log tool invocations

**Example - Sanitize Bash Commands:**
```typescript
"tool.execute.before": async (input, output) => {
  if (input.tool === "bash") {
    output.args.command = output.args.command
      .replace(/rm\s+-rf\s+\//, "echo blocked:")
  }
}
```

---

### tool.execute.after Hook

**Signature:**
```typescript
"tool.execute.after"?: (
  input: {
    tool: string           // Tool name
    sessionID: string
    callID: string
    args: any              // Arguments used
  },
  output: {
    title: string          // Result display title (mutable)
    output: string         // Result content (mutable)
    metadata: any          // Result metadata (mutable)
  }
) => Promise<void>
```

**Use Cases:**
- Process tool results
- Extract and log metrics
- Transform output for display
- Emit telemetry events

**Example - Track Execution Duration:**
```typescript
const startTime = new Map<string, number>()

"tool.execute.before": (input, output) => {
  startTime.set(input.callID, Date.now())
}

"tool.execute.after": (input, output) => {
  const duration = Date.now() - (startTime.get(input.callID) || Date.now())
  telemetry.emit("tool_executed", {
    tool: input.tool,
    durationMs: duration,
    resultSize: output.output.length
  })
  startTime.delete(input.callID)
}
```

---

### tool.definition Hook

**Signature:**
```typescript
"tool.definition"?: (
  input: {
    toolID: string         // Tool identifier
  },
  output: {
    description: string    // Tool description (mutable)
    parameters: any        // Parameter schema (mutable)
  }
) => Promise<void>
```

**Characteristics:**
- Modifies how tool is presented to LLM
- Changes only LLM perception, not validation
- Parameter schema modifications don't affect execution validation
- Called before tool schema sent to LLM

**Use Cases:**
- Dynamically customize tool descriptions
- Hide/restrict parameters per context
- Localize tool descriptions
- Adjust parameters based on user role

**Two-Stage Validation:**
1. **Plugin hook stage** - Schema modifications seen by LLM
2. **Pre-execution stage** - Arguments validated against **original** Zod schema

---

### chat.message Hook

**Signature:**
```typescript
"chat.message"?: (
  input: {
    sessionID: string
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    messageID?: string
    variant?: string
  },
  output: {
    message: UserMessage    // Message object (mutable)
    parts: Part[]           // Message parts array (mutable)
  }
) => Promise<void>
```

**Use Cases:**
- Track/log user messages
- Extract and analyze content
- Emit telemetry events
- Redact sensitive information

---

### chat.params Hook

**Signature:**
```typescript
"chat.params"?: (
  input: {
    sessionID: string
    agent: string
    model: Model
    provider: ProviderContext
    message: UserMessage
  },
  output: {
    temperature: number     // Randomness (0-1)
    topP: number           // Nucleus sampling
    topK: number           // Top-K sampling
    options: Record<string, any>  // Provider-specific options
  }
) => Promise<void>
```

**Use Cases:**
- Adjust LLM behavior based on session context
- Increase temperature for creative tasks
- Reduce for deterministic outputs
- Pass provider-specific configurations

---

### chat.headers Hook

**Signature:**
```typescript
"chat.headers"?: (
  input: {
    sessionID: string
    agent: string
    model: Model
    provider: ProviderContext
    message: UserMessage
  },
  output: {
    headers: Record<string, string>  // HTTP headers (mutable)
  }
) => Promise<void>
```

**Use Cases:**
- Inject custom authentication headers
- Add custom API keys
- Set tracking headers
- Add provider-specific options

---

### shell.env Hook

**Signature:**
```typescript
"shell.env"?: (
  input: {
    cwd: string            // Working directory
    sessionID?: string
    callID?: string
  },
  output: {
    env: Record<string, string>  // Environment variables (mutable)
  }
) => Promise<void>
```

**Use Cases:**
- Set API keys for shell commands
- Configure proxy settings
- Add custom PATH entries
- Inject authentication tokens

---

### config Hook

**Signature:**
```typescript
"config"?: (input: Config) => Promise<void>
```

Called once at startup with OpenCode configuration. Plugins can:
- Read configuration
- Validate required settings
- Initialize plugin state
- Log configuration warnings

---

### event Hook

**Signature:**
```typescript
"event"?: (input: {
  event: Event  // System event
}) => Promise<void>
```

Receives all system events including:
- `chat.message.created`
- `tool.executed`
- `command.executed`
- `session.diff`
- `error.occurred`

---

### auth Hook

**Signature:**
```typescript
"auth"?: {
  provider: string
  loader?: (auth: () => Promise<Auth>, provider: Provider) => Promise<Record<string, any>>
  methods: (OAuth | API)[]
}
```

**OAuth Method:**
```typescript
{
  type: "oauth"
  label: string
  prompts?: Array<TextPrompt | SelectPrompt>
  authorize(inputs?: Record<string, string>): Promise<AuthOauthResult>
}
```

**API Method:**
```typescript
{
  type: "api"
  label: string
  prompts?: Array<TextPrompt | SelectPrompt>
  authorize?(inputs?: Record<string, string>): Promise<{
    type: "success" | "failed"
    key: string
    provider?: string
  }>
}
```

---

### tool Hook

**Signature:**
```typescript
"tool"?: {
  [key: string]: ToolDefinition
}
```

**ToolDefinition:**
```typescript
{
  description: string
  args: z.ZodRawShape          // Zod schema
  execute(args: any, context: ToolContext): Promise<string>
}
```

**ToolContext:**
```typescript
{
  sessionID: string
  messageID: string
  agent: string
  directory: string
  worktree: string
  abort: AbortSignal
  metadata(input: {...}): void
  ask(input: AskInput): Promise<void>
}
```

---

## Plugin Loading & Initialization

### Dispatcher Architecture

The Plugin dispatcher uses **lazy, singleton initialization per instance**:

```typescript
const state = Instance.state(async () => {
  const client = createOpencodeClient({...})
  const config = await Config.get()
  const hooks: Hooks[] = []
  const input: PluginInput = {...}
  
  // Load internal plugins (CodexAuth, CopilotAuth, GitlabAuth)
  // Load external plugins from config
  
  return { hooks, input }
})
```

### Loading Process

1. **Internal Plugins** - Built-in plugins (CodexAuthPlugin, CopilotAuthPlugin, GitlabAuthPlugin) loaded first
2. **External Plugins** - From `config.plugins` array
3. **NPM Resolution** - `"my-plugin@1.2.3"` installed via Bun
4. **Import** - Dynamic module import with error handling
5. **Deduplication** - Prevents same function registering twice
6. **Registration** - Hooks added to global array

### Error Handling

**For each plugin error:**
1. Logged via `log.error()` with context
2. Published to event bus: `Bus.publish(Session.Event.Error, ...)`
3. Application continues (graceful degradation)
4. User notified via UI

---

## Hook Execution Model

### Trigger Pattern - Type-Safe Dispatch

```typescript
export async function trigger<Name extends keyof Hooks>(
  name: Name,
  input: Input,
  output: Output
): Promise<Output> {
  for (const hook of await state().then(x => x.hooks)) {
    const fn = hook[name]
    if (!fn) continue
    
    await fn(input, output)  // Sequential execution
  }
  
  return output  // Modified output returned
}
```

### Execution Characteristics

- **Sequential** - Hooks execute in order
- **Input immutable** - Cannot modify input
- **Output mutable** - Direct in-place mutation
- **Type-safe** - Generics ensure type matching
- **No short-circuiting** - All hooks execute
- **Error propagation** - Errors bubble to caller

### Lifecycle Sequence

```
Plugin Initialization:
1. All plugins loaded (internal + external)
2. config hook called for each plugin
3. Event bus subscription established

During Session:
1. chat.message → (plugin hooks) → chat.params → chat.headers → LLM API
2. tool.definition → (before sending to LLM)
3. tool.execute.before → Tool runs → tool.execute.after
4. command.execute.before → Command runs
5. shell.env → Shell command executes
6. event → (all system events)
7. permission.ask → Permission decision
```

---

## Plugin Sources

### Built-in Plugins

**CodexAuthPlugin** - OpenAI/ChatGPT integration
- Hooks: `auth`, `chat.headers`
- Features: OAuth, token refresh, endpoint routing

**CopilotAuthPlugin** - GitHub Copilot
- Hooks: `auth`, `chat.headers`
- Features: Device code flow, GitHub Enterprise, vision detection

**GitlabAuthPlugin** - GitLab integration
- Hooks: Similar to Copilot
- Package: `@gitlab/opencode-gitlab-auth`

### Loading Sources

```typescript
// NPM packages (auto-installed)
"my-plugin@1.2.3"
"my-plugin@latest"
"my-plugin"

// File URLs (local plugins)
"file:///path/to/plugin"

// Built-in defaults
"opencode-anthropic-auth@0.0.13"
```

---

## Provider-Specific Schema Transformation

Tools sent to LLM undergo provider-specific transformation after plugin hooks:

### Gemini Sanitization Example

```typescript
// Convert integer enums to strings
enums: [1, 2, 3] → ["1", "2", "3"]

// Remove type constraints from non-objects
{ type: ["string", "null"] } → { type: "string" }

// Ensure array items have schema
{ type: "array", items: {} } → { type: "array", items: { type: "string" } }

// Filter required fields
required: ["unknown_field"] → required: []
```

**Purpose:** Ensure Gemini API compatibility while preserving LLM understanding

---

## Tool Execution Flow with Plugin Hooks

```
1. Tool.define() wrapper created with original Zod schema
2. tool.definition hook called (plugin can modify description/parameters)
3. Modified schema sent to LLM
4. User invokes tool (LLM calls with args)
5. tool.execute.before hook called (can modify args)
6. Args validated against ORIGINAL Zod schema
7. Tool executes with validated args
8. tool.execute.after hook called (can process result)
9. Final result returned to user
```

**Key Insight:** Plugin modifications to parameters only affect LLM understanding; validation always uses original schema for security.

---

## Best Practices

### 1. Graceful Error Handling

```typescript
"tool.execute.before": async (input, output) => {
  try {
    // Modify args
    output.args.cleaned = sanitize(output.args.raw)
  } catch (err) {
    // Don't throw - log and continue
    console.error("Failed to sanitize args", err)
    // output.args unchanged, original args will be validated
  }
}
```

### 2. Direct Mutation for Output

```typescript
// ✅ Correct - Direct mutation
output.args.command = transformCommand(output.args.command)

// ❌ Wrong - Return value ignored
return { args: { ...output.args, command: ... } }
```

### 3. State Management for Cross-Hook Communication

```typescript
const toolStartTimes = new Map<string, number>()

"tool.execute.before": (input, output) => {
  toolStartTimes.set(input.callID, Date.now())
}

"tool.execute.after": (input, output) => {
  const duration = Date.now() - (toolStartTimes.get(input.callID) || 0)
  toolStartTimes.delete(input.callID)
  // Use duration...
}
```

### 4. Immutable Input Pattern

```typescript
"chat.message": async (input, output) => {
  // Use input for context/routing
  const { sessionID, agent } = input
  
  // Modify output only
  output.message.content = sanitize(output.message.content)
  output.parts = output.parts.filter(p => p.type === "text")
}
```

### 5. Type-Safe Hook Usage

```typescript
// Use Plugin.trigger for type safety
const result = await Plugin.trigger(
  "chat.params",
  {
    sessionID,
    agent,
    model,
    provider,
    message
  },
  {
    temperature: 0.7,
    topP: 1.0,
    topK: 40,
    options: {}
  }
)
```

---

## Reference Implementation Sources

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Hook Types | `@opencode-ai/plugin` dist | TypeScript type definitions |
| Dispatcher | `packages/opencode/src/plugin/index.ts` | Hook loading and triggering |
| Session Prompt | `packages/opencode/src/session/prompt.ts` | Hook invocation in execution flow |
| Tool Registry | `packages/opencode/src/tool/registry.ts` | Tool definition and schema rewrite |
| Tool Wrapper | `packages/opencode/src/tool/tool.ts` | Zod validation wrapper |
| Provider Transform | `packages/opencode/src/provider/transform.ts` | Provider-specific schema sanitization |
| Plugin Bootstrap | `packages/opencode/src/project/bootstrap.ts` | Initialization sequence |
| Event Bus | `packages/opencode/src/bus/index.ts` | Event distribution |

---

## Summary

OpenCode's plugin system provides:

✅ **Middleware-pattern hooks** - Immutable inputs, mutable outputs  
✅ **Type-safe triggers** - Compile-time safety with generics  
✅ **Lazy initialization** - Efficient, singleton per instance  
✅ **Graceful degradation** - Isolated plugin errors don't crash app  
✅ **Event-driven** - Bus for loose coupling  
✅ **Flexible loading** - NPM, file URLs, built-in plugins  
✅ **Pre/post-execution hooks** - Full control over tool lifecycle  
✅ **Schema transformation** - Plugin hooks + provider-specific sanitization  

This enables robust customization without modifying core code.
