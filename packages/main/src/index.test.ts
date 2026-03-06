import { expect, test } from "bun:test";

import type { PluginInput } from "@opencode-ai/plugin";
import { createOpencodeHooks } from "./index";

test("createOpencodeHooks returns opencode hook handlers", () => {
  const hooks = createOpencodeHooks({
    directory: "/tmp/project",
    worktree: "/tmp/project",
  } as PluginInput);

  expect(typeof hooks["tool.execute.before"]).toBe("function");
  expect(typeof hooks["tool.execute.after"]).toBe("function");
  expect(typeof hooks["permission.ask"]).toBe("function");
});
