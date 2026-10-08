import { spawn } from "node:child_process";
import { mkdtemp, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderTicket } from "./tickets.mjs";
import { saveTicketPdf } from "./pdf.mjs";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export class DefinitePrintFailure extends Error {}
export class UnknownPrintOutcome extends Error {}

export async function submitToLp(queueName, ticket, title, timeoutMs = 30_000) {
  return new Promise((resolveJob, rejectJob) => {
    const child = spawn("lp", ["-d", queueName, "-t", title], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(0, 4096);
    });
    child.stderr.on("data", () => {}); // Never log spooler output: it may contain customer data.
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectJob(
        error.code === "ENOENT"
          ? new DefinitePrintFailure("The lp command is unavailable")
          : new UnknownPrintOutcome("Could not determine whether lp accepted the ticket"),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut)
        return rejectJob(new UnknownPrintOutcome("lp timed out; queue result is unknown"));
      if (code !== 0)
        return rejectJob(new DefinitePrintFailure(`lp rejected the ticket (exit ${code})`));
      const match = /request id is\s+([^\s(]+)/i.exec(stdout);
      if (!match)
        return rejectJob(new UnknownPrintOutcome("lp returned success without a parseable job ID"));
      resolveJob(match[1]);
    });
    child.stdin.end(ticket);
  });
}

export async function processLeasedJob(
  job,
  {
    queueName,
    submit,
    report,
    savePdf = saveTicketPdf,
    pdfDirectory,
    wait = sleep,
    log = () => {},
    retryDelayMs = 3000,
  },
) {
  let result;
  try {
    const pdfPath = await savePdf(job, pdfDirectory);
    log(`Job ${job.id}: PDF saved at ${pdfPath}`);
  } catch {
    result = {
      leaseToken: job.leaseToken,
      result: "failed",
      queueName,
      error: "Could not create receipt PDF; printer was not called",
    };
  }
  try {
    if (result) throw new DefinitePrintFailure(result.error);
    const spoolerJobId = await submit(
      queueName,
      renderTicket(job),
      `Rogane Chimac ${job.destination} ${job.payload.orderNumber}`,
    );
    result = { leaseToken: job.leaseToken, result: "queued", queueName, spoolerJobId };
  } catch (error) {
    if (!(error instanceof DefinitePrintFailure)) {
      log(
        `Job ${job.id}: queue outcome unknown; wait for lease expiry and inspect before retrying.`,
      );
      return "uncertain";
    }
    result = { leaseToken: job.leaseToken, result: "failed", queueName, error: error.message };
  }
  for (;;) {
    try {
      const acknowledged = await report(job.id, result);
      log(`Job ${job.id}: ${acknowledged.status}`);
      return acknowledged.status;
    } catch (error) {
      if (error instanceof WorkerHttpError && error.status >= 400 && error.status < 500)
        throw error;
      log(
        `Job ${job.id}: report unavailable; retrying acknowledgement without resubmitting to lp.`,
      );
      await wait(retryDelayMs);
    }
  }
}

export async function previewJobs(jobs, root = tmpdir()) {
  if (!jobs.length) return [];
  const latestOrderId = jobs.at(-1).orderId;
  const selected = jobs.filter((job) => job.orderId === latestOrderId);
  const directory = await mkdtemp(join(root, "seoul-print-preview-"));
  await chmod(directory, 0o700);
  const paths = [];
  for (const destination of ["kitchen", "front"]) {
    const job = selected.find((entry) => entry.destination === destination);
    if (!job) continue;
    const path = join(directory, `${destination}.txt`);
    await writeFile(path, renderTicket(job), { mode: 0o600 });
    paths.push(path);
  }
  return paths;
}

class WorkerHttpError extends Error {
  constructor(status) {
    super(`API returned HTTP ${status}`);
    this.status = status;
  }
}

function createApi(baseUrl, token) {
  const request = async (path, method = "GET", body) => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new WorkerHttpError(response.status);
    return response.json();
  };
  return {
    list: async () => (await request("api/local-print-jobs")).jobs,
    claim: async () => (await request("api/local-print-jobs/claim", "POST")).job,
    report: async (id, result) =>
      (await request(`api/local-print-jobs/${id}/report`, "POST", result)).job,
  };
}

export async function runWorker({
  api,
  queues,
  once = false,
  dryRun = false,
  pollIntervalMs = 3000,
  pdfDirectory = resolve("data/receipts"),
  submit = submitToLp,
  log = console.log,
}) {
  if (dryRun) {
    if (!once) throw new Error("--dry-run must be used with --once");
    const paths = await previewJobs(await api.list());
    log(
      paths.length ? `Read-only preview files: ${paths.join(", ")}` : "No print jobs to preview.",
    );
    return;
  }
  for (;;) {
    let job;
    try {
      job = await api.claim();
    } catch (error) {
      if (error instanceof WorkerHttpError && [401, 403, 404].includes(error.status)) throw error;
      log("Order API unavailable; retrying claim.");
      await sleep(pollIntervalMs);
      continue;
    }
    if (!job) {
      if (once) return;
      await sleep(pollIntervalMs);
      continue;
    }
    const queueName = queues[job.destination];
    try {
      await processLeasedJob(job, { queueName, submit, report: api.report, pdfDirectory, log });
    } catch {
      log(`Job ${job.id}: acknowledgement rejected; inspect job before manual retry.`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== "--dry-run" && arg !== "--once"))
    throw new Error("Usage: npm run print:main -- [--once] [--dry-run --once]");
  const baseUrl = process.env.ORDER_API_BASE_URL;
  const token = process.env.PRINT_WORKER_TOKEN;
  const kitchen = process.env.KITCHEN_PRINTER;
  const front = process.env.FRONT_PRINTER;
  const pollIntervalMs = Number(process.env.PRINT_POLL_INTERVAL_MS || 3000);
  const pdfDirectory = resolve(process.env.PRINT_PDF_DIR || "data/receipts");
  if (!baseUrl || !/^https?:$/.test(new URL(baseUrl).protocol))
    throw new Error("Set ORDER_API_BASE_URL to an HTTP(S) server URL");
  if (!token) throw new Error("Set PRINT_WORKER_TOKEN");
  if (!args.has("--dry-run") && (!kitchen || !front))
    throw new Error("Set KITCHEN_PRINTER and FRONT_PRINTER to exact system queue names");
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 500)
    throw new Error("PRINT_POLL_INTERVAL_MS must be at least 500");
  await runWorker({
    api: createApi(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, token),
    queues: { kitchen, front },
    once: args.has("--once"),
    dryRun: args.has("--dry-run"),
    pollIntervalMs,
    pdfDirectory,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Print worker stopped. Check configuration or API access.");
    process.exitCode = 1;
  });
}
