export {};

type CaptureKind = "logs" | "metrics" | "other";

const env = Bun.env;
const args = new Set(Bun.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  process.stdout.write(`OTLP capture/proxy server

Env:
- PORT: listen port, default 4318
- HOST: listen host, default 127.0.0.1
- OTEL_CAPTURE_DIR: output dir, default ./.tmp/otlp-capture
- OTEL_PROXY_TARGET: optional upstream base URL, ex http://127.0.0.1:4320

Routes:
- POST /v1/logs
- POST /v1/metrics
- GET /healthz
`);
  process.exit(0);
}

const port = Number.parseInt(env.PORT ?? "4318", 10);
const hostname = env.HOST ?? "127.0.0.1";
const captureDir = env.OTEL_CAPTURE_DIR ?? "./.tmp/otlp-capture";
const proxyTarget = env.OTEL_PROXY_TARGET?.replace(/\/$/, "");

const ensureDir = async (path: string): Promise<void> => {
  await Bun.$`mkdir -p ${path}`.quiet();
};

const timestampId = (): string => {
  return `${Date.now()}-${crypto.randomUUID()}`;
};

const classify = (pathname: string): CaptureKind => {
  if (pathname === "/v1/logs") {
    return "logs";
  }
  if (pathname === "/v1/metrics") {
    return "metrics";
  }
  return "other";
};

const writePayload = async (
  pathname: string,
  headers: Headers,
  bodyText: string,
): Promise<{ filePath: string; kind: CaptureKind }> => {
  const kind = classify(pathname);
  const filePath = `${captureDir}/${kind}/${timestampId()}.json`;
  await ensureDir(`${captureDir}/${kind}`);
  await Bun.write(
    filePath,
    JSON.stringify(
      {
        receivedAt: new Date().toISOString(),
        path: pathname,
        headers: Object.fromEntries(headers.entries()),
        body: bodyText,
      },
      null,
      2,
    ),
  );
  return { filePath, kind };
};

const proxyRequest = async (
  req: Request,
  pathname: string,
  bodyText: string,
): Promise<Response | undefined> => {
  if (!proxyTarget) {
    return undefined;
  }

  const response = await fetch(`${proxyTarget}${pathname}`, {
    method: req.method,
    headers: req.headers,
    body: bodyText,
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: response.headers,
  });
};

await ensureDir(captureDir);

const server = Bun.serve({
  port,
  hostname,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true, proxyTarget: proxyTarget ?? null });
    }

    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const bodyText = await req.text();
    const { filePath, kind } = await writePayload(
      url.pathname,
      req.headers,
      bodyText,
    );
    const proxied = await proxyRequest(req, url.pathname, bodyText);

    process.stdout.write(
      `[otlp-capture] ${kind} ${url.pathname} -> ${filePath}${proxyTarget ? ` -> ${proxyTarget}${url.pathname}` : ""}\n`,
    );

    if (proxied) {
      return proxied;
    }

    return Response.json({ ok: true, kind, filePath });
  },
});

process.stdout.write(
  `[otlp-capture] listening on http://${server.hostname}:${server.port} captureDir=${captureDir}${proxyTarget ? ` proxy=${proxyTarget}` : ""}\n`,
);
