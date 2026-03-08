import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(scriptDir);
const sourceHtml = join(packageDir, "src", "index.html");
const outdir = join(packageDir, "dist");

const normalizeBasePath = (value: string) => {
  if (value === "/") {
    return "/";
  }

  const trimmed = value.replace(/^\/+|\/+$/g, "");
  return trimmed.length > 0 ? `/${trimmed}/` : "/";
};

const resolvePublicBasePath = () => {
  const explicit = process.env.PUBLIC_BASE_PATH?.trim();
  if (explicit) {
    return normalizeBasePath(explicit);
  }

  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (!repository) {
    return "/";
  }

  const parts = repository.split("/").filter(Boolean);
  const repoName = parts[parts.length - 1];
  return repoName ? `/${repoName}/` : "/";
};

await rm(outdir, { force: true, recursive: true });
await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [sourceHtml],
  minify: true,
  outdir,
  packages: "bundle",
  publicPath: resolvePublicBasePath(),
  sourcemap: "external",
  splitting: true,
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  process.exit(1);
}

await copyFile(join(outdir, "index.html"), join(outdir, "404.html"));
