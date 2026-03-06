import { expect, test } from "bun:test";

import { resolveLanguageFromPath } from "./index";

test("resolveLanguageFromPath maps extension", () => {
  expect(resolveLanguageFromPath("src/main.ts")).toBe("typescript");
  expect(resolveLanguageFromPath("src/main.unknown")).toBeUndefined();
});
