import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openOrderStore } from "./order-service.mjs";

const json = (res, status, body) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024)
      throw Object.assign(new Error("Request is too large"), { status: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function validBearerToken(header, expected) {
  if (!expected || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

export function createOrderApi(orderStore = openOrderStore(), options = {}) {
  const demoPaymentEnabled = options.demoPaymentEnabled ?? process.env.ENABLE_DEMO_PAYMENT === "1";
  const printWorkerToken = options.printWorkerToken ?? process.env.PRINT_WORKER_TOKEN;
  const merchantToken = options.merchantToken ?? process.env.MERCHANT_TOKEN;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/health")
        return json(res, 200, { status: "ok" });
      if (req.method === "POST" && url.pathname === "/api/orders") {
        const input = await readJson(req);
        return json(res, 201, orderStore.create(input, req.headers["idempotency-key"]));
      }
      if (url.pathname === "/api/print-jobs" || url.pathname.startsWith("/api/print-jobs/")) {
        if (!printWorkerToken)
          return json(res, 503, { error: "Print worker access is not configured" });
        if (!validBearerToken(req.headers.authorization, printWorkerToken))
          return json(res, 401, { error: "Unauthorized" });
        if (req.method === "GET" && url.pathname === "/api/print-jobs")
          return json(res, 200, { jobs: orderStore.listPrintJobs() });
        if (req.method === "POST" && url.pathname === "/api/print-jobs/claim")
          return json(res, 200, { job: orderStore.claimPrintJob() });
        const jobAction = /^\/api\/print-jobs\/([0-9a-f-]{36})\/(report|retry)$/.exec(url.pathname);
        if (req.method === "POST" && jobAction) {
          const input = await readJson(req);
          const job =
            jobAction[2] === "report"
              ? orderStore.reportPrintJob(jobAction[1], input)
              : orderStore.retryPrintJob(jobAction[1], input?.reason);
          return json(res, 200, { job });
        }
        return json(res, 404, { error: "Not found" });
      }
      if (url.pathname === "/api/merchant/orders" || url.pathname.startsWith("/api/merchant/orders/")) {
        if (!merchantToken)
          return json(res, 503, { error: "Merchant access is not configured" });
        if (!validBearerToken(req.headers.authorization, merchantToken))
          return json(res, 401, { error: "Unauthorized" });
        if (req.method === "GET" && url.pathname === "/api/merchant/orders")
          return json(res, 200, { orders: orderStore.listMerchantOrders() });
        const progressMatch = /^\/api\/merchant\/orders\/(ST-[0-9A-F]{10})\/progress$/.exec(url.pathname);
        if (req.method === "POST" && progressMatch) {
          const input = await readJson(req);
          if (!input || typeof input !== "object" || Array.isArray(input) ||
              Object.keys(input).length !== 1 || typeof input.status !== "string")
            return json(res, 400, { error: "Body must contain only status" });
          return json(res, 200, { order: orderStore.updateFulfillment(progressMatch[1], input.status) });
        }
        return json(res, 404, { error: "Not found" });
      }
      const paymentMatch = /^\/api\/orders\/(ST-[0-9A-F]{10})\/demo-payment$/.exec(url.pathname);
      if (req.method === "POST" && paymentMatch) {
        if (!demoPaymentEnabled) return json(res, 503, { error: "Demo payment is disabled" });
        const token = req.headers["x-order-token"];
        if (!orderStore.get(paymentMatch[1], token))
          return json(res, 404, { error: "Order not found" });
        const input = await readJson(req);
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          !["success", "failure"].includes(input.result)
        )
          return json(res, 400, { error: "Body must contain only result: success or failure" });
        return json(res, 200, orderStore.simulatePayment(paymentMatch[1], token, input.result));
      }
      const match = /^\/api\/orders\/(ST-[0-9A-F]{10})$/.exec(url.pathname);
      if (req.method === "GET" && match) {
        const order = orderStore.get(match[1], req.headers["x-order-token"]);
        return order ? json(res, 200, order) : json(res, 404, { error: "Order not found" });
      }
      return json(res, 404, { error: "Not found" });
    } catch (error) {
      const status = error.status ?? 500;
      if (status >= 500) console.error(error);
      return json(res, status, { error: status >= 500 ? "Request failed" : error.message });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.ORDER_API_PORT || 3001);
  createOrderApi().listen(port, "127.0.0.1", () =>
    console.log(`Order API listening on 127.0.0.1:${port}`),
  );
}
