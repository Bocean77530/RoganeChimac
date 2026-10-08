import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const digest = (value) => createHash("sha256").update(value).digest();

function validDemoLogin(header, password) {
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;
  const supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
  return timingSafeEqual(digest(supplied), digest(`demo:${password}`));
}

export function createDemoGateway({ apiPort, sitePort, password }) {
  if (typeof password !== "string" || password.length < 16)
    throw new Error("Set DEMO_SITE_PASSWORD to at least 16 characters");

  return createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return res.end("ok");
    }

    // These APIs enforce separate Bearer tokens and must be reachable by the shop worker.
    const bearerApi = pathname === "/api/print-jobs" || pathname.startsWith("/api/print-jobs/") ||
      pathname === "/api/merchant/orders" || pathname.startsWith("/api/merchant/orders/");
    if (!bearerApi && !validDemoLogin(req.headers.authorization, password)) {
      res.writeHead(401, {
        "www-authenticate": 'Basic realm="Seoul Table Demo", charset="UTF-8"',
        "cache-control": "no-store",
      });
      return res.end("Demo sign-in required");
    }

    const targetPort = pathname.startsWith("/api/") ? apiPort : sitePort;
    const upstream = httpRequest({
      hostname: "127.0.0.1", port: targetPort, method: req.method,
      path: req.url, headers: req.headers,
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "cache-control": "no-store" });
      res.end("Demo service unavailable");
    });
    req.pipe(upstream);
  });
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("A demo service exited during startup");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Child may still be starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Demo service did not become ready");
}

async function main() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  if (process.env.ENABLE_DEMO_PAYMENT !== "1")
    throw new Error("Set ENABLE_DEMO_PAYMENT=1 for the demo service");
  if (!process.env.PRINT_WORKER_TOKEN || !process.env.MERCHANT_TOKEN)
    throw new Error("Set separate PRINT_WORKER_TOKEN and MERCHANT_TOKEN values");
  if (!process.env.ORDER_DB_PATH)
    throw new Error("Set ORDER_DB_PATH to the persistent Railway volume");

  const apiPort = 3001;
  const sitePort = 3002;
  const children = [
    spawn(process.execPath, ["server/api.mjs"], {
      env: { ...process.env, ORDER_API_PORT: String(apiPort) }, stdio: "inherit",
    }),
    spawn(process.execPath, [".output/server/index.mjs"], {
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(sitePort) }, stdio: "inherit",
    }),
  ];
  let stopping = false;
  let gateway;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
    gateway?.close();
    process.exitCode = code;
  };
  for (const child of children) {
    child.on("error", () => stop(1));
    child.on("exit", () => stop(1));
  }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  try {
    await Promise.all([
      waitFor(`http://127.0.0.1:${apiPort}/api/health`, children[0]),
      waitFor(`http://127.0.0.1:${sitePort}/`, children[1]),
    ]);
    gateway = createDemoGateway({ apiPort, sitePort, password: process.env.DEMO_SITE_PASSWORD });
    gateway.listen(port, "0.0.0.0", () => console.log(`Demo gateway listening on ${port}`));
  } catch (error) {
    stop(1);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
