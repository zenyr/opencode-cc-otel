import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(scriptDir);
const repoDir = dirname(dirname(packageDir));

const srcDir = join(packageDir, "src");
const entryHtml = join(srcDir, "index.html");
const packageJsonPath = join(packageDir, "package.json");
const rootPackageJsonPath = join(repoDir, "package.json");
const bunLockPath = join(repoDir, "bun.lock");

let child: Bun.Subprocess<"inherit", "inherit", "inherit"> | undefined;
let expectedExit = false;
let restartTimer: ReturnType<typeof setTimeout> | undefined;
let shuttingDown = false;

const log = (msg: string) => {
  console.log(`[site-dev] ${msg}`);
};

const spawnServer = () => {
  log("start bun native dev server");

  child = Bun.spawn(["bun", entryHtml], {
    cwd: packageDir,
    env: Bun.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    onExit(proc, exitCode, signalCode, error) {
      child = undefined;

      if (error) {
        log(`server exit err: ${error.message}`);
      }

      if (shuttingDown || expectedExit) {
        expectedExit = false;
        return;
      }

      log(`server exited unexpectedly (code=${exitCode} signal=${signalCode})`);
      scheduleRestart("unexpected exit");
      void proc;
    },
  });
};

const performRestart = () => {
  restartTimer = undefined;

  if (shuttingDown) {
    return;
  }

  if (!child) {
    spawnServer();
    return;
  }

  expectedExit = true;
  child.kill();

  setTimeout(() => {
    if (!shuttingDown) {
      spawnServer();
    }
  }, 120);
};

const scheduleRestart = (reason: string) => {
  if (shuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  log(`restart scheduled: ${reason}`);
  restartTimer = setTimeout(performRestart, 120);
};

const watchFile = (filePath: string, label: string) => {
  return watch(filePath, () => {
    scheduleRestart(`${label} changed`);
  });
};

const watchDir = (dirPath: string, label: string) => {
  return watch(dirPath, { recursive: true }, (eventType, fileName) => {
    if (eventType !== "rename") {
      return;
    }

    const target =
      typeof fileName === "string" && fileName.length > 0
        ? `${label}/${fileName}`
        : label;
    scheduleRestart(`${target} renamed`);
  });
};

const stop = () => {
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = undefined;
  }

  if (child) {
    expectedExit = true;
    child.kill();
  }
};

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

watchDir(srcDir, "src");
watchFile(packageJsonPath, "web package.json");
watchFile(rootPackageJsonPath, "root package.json");
watchFile(bunLockPath, "bun.lock");

spawnServer();
