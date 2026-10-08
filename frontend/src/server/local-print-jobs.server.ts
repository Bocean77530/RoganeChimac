import "@tanstack/react-start/server-only";

import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { withDatabase } from "@/db/client.server";
import { integrationJobs } from "@/db/schema";
import type { LocalPrintDestination, LocalPrintPayload } from "@/domain/local-print";

type PrintJobRow = typeof integrationJobs.$inferSelect;

function authorized(header: string | null): boolean {
  const expected = process.env.PRINT_WORKER_TOKEN;
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const secret = Buffer.from(expected);
  return received.length === secret.length && timingSafeEqual(received, secret);
}

export function requirePrintWorker(request: Request): Response | null {
  if (!process.env.PRINT_WORKER_TOKEN || process.env.PRINT_WORKER_TOKEN.length < 32) {
    return Response.json({ error: "print_worker_unavailable" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function view(row: PrintJobRow, leaseToken?: string) {
  const payload = row.payload as LocalPrintPayload;
  return {
    id: row.id,
    orderId: row.orderId,
    destination: payload.destination as LocalPrintDestination,
    payload,
    ...(leaseToken ? { leaseToken } : {}),
    status: row.status,
  };
}

export async function listLocalPrintJobs() {
  return withDatabase(async (db) => {
    const rows = await db
      .select()
      .from(integrationJobs)
      .where(
        and(
          eq(integrationJobs.provider, "local_worker"),
          eq(integrationJobs.kind, "kitchen_print"),
          eq(integrationJobs.payloadVersion, 1),
          inArray(integrationJobs.status, ["queued", "retry_scheduled"]),
        ),
      )
      .orderBy(asc(integrationJobs.createdAt), asc(integrationJobs.id))
      .limit(50);
    return rows.map((row) => view(row));
  });
}

export async function claimLocalPrintJob() {
  return withDatabase((db) =>
    db.transaction(async (tx) => {
      const candidate = await tx.execute<{ id: string }>(sql`
        SELECT id FROM integration_jobs
        WHERE provider = 'local_worker'
          AND kind = 'kitchen_print'
          AND payload_version = 1
          AND status IN ('queued', 'retry_scheduled')
          AND next_attempt_at <= now()
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const id = candidate.rows[0]?.id;
      if (!id) return null;
      const leaseToken = crypto.randomUUID();
      const now = new Date();
      const [row] = await tx
        .update(integrationJobs)
        .set({
          status: "processing",
          attemptCount: sql`${integrationJobs.attemptCount} + 1`,
          lockedAt: now,
          leaseExpiresAt: new Date(now.getTime() + 120_000),
          lockedBy: leaseToken,
          updatedAt: now,
        })
        .where(eq(integrationJobs.id, id))
        .returning();
      return row ? view(row, leaseToken) : null;
    }),
  );
}

export type PrintJobReport = {
  leaseToken: string;
  result: "queued" | "failed";
  queueName: string;
  spoolerJobId?: string;
  error?: string;
};

export async function reportLocalPrintJob(id: string, report: PrintJobReport) {
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !/^[0-9a-f-]{36}$/i.test(report.leaseToken) ||
    !["queued", "failed"].includes(report.result) ||
    !report.queueName ||
    report.queueName.length > 128 ||
    (report.result === "queued" && (!report.spoolerJobId || report.spoolerJobId.length > 255)) ||
    (report.result === "failed" && (!report.error || report.error.length > 300))
  ) {
    return { ok: false as const, status: 400, error: "invalid_report" };
  }
  return withDatabase(async (db) => {
    const now = new Date();
    const [current] = await db
      .select()
      .from(integrationJobs)
      .where(
        and(
          eq(integrationJobs.id, id),
          eq(integrationJobs.provider, "local_worker"),
          eq(integrationJobs.lockedBy, report.leaseToken),
        ),
      )
      .limit(1);
    if (!current) return { ok: false as const, status: 404, error: "job_not_found" };
    if (
      (current.status === "succeeded" && report.result === "queued") ||
      (["retry_scheduled", "manual_action_required"].includes(current.status) &&
        report.result === "failed")
    ) {
      return { ok: true as const, job: view(current) };
    }
    if (current.status !== "processing") {
      return { ok: false as const, status: 409, error: "lease_not_active" };
    }
    const retry = report.result === "failed" && current.attemptCount < current.maxAttempts;
    const [updated] = await db
      .update(integrationJobs)
      .set({
        status:
          report.result === "queued"
            ? "succeeded"
            : retry
              ? "retry_scheduled"
              : "manual_action_required",
        externalId: report.result === "queued" ? report.spoolerJobId : null,
        lastErrorCode: report.result === "failed" ? "LOCAL_PRINT_FAILED" : null,
        lastErrorMessage: report.result === "failed" ? report.error : null,
        nextAttemptAt: retry ? new Date(now.getTime() + 30_000) : current.nextAttemptAt,
        lockedAt: null,
        leaseExpiresAt: null,
        updatedAt: now,
        completedAt: report.result === "queued" ? now : null,
      })
      .where(
        and(
          eq(integrationJobs.id, id),
          eq(integrationJobs.status, "processing"),
          eq(integrationJobs.lockedBy, report.leaseToken),
        ),
      )
      .returning();
    if (!updated) return { ok: false as const, status: 409, error: "lease_not_active" };
    return { ok: true as const, job: view(updated) };
  });
}

export async function retryLocalPrintJob(id: string, reason: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || reason.trim().length < 8 || reason.length > 200) {
    return { ok: false as const, status: 400, error: "invalid_retry" };
  }
  return withDatabase(async (db) => {
    const [current] = await db
      .select()
      .from(integrationJobs)
      .where(and(eq(integrationJobs.id, id), eq(integrationJobs.provider, "local_worker")))
      .limit(1);
    if (!current) return { ok: false as const, status: 404, error: "job_not_found" };
    const expiredLease =
      current.status === "processing" &&
      current.leaseExpiresAt &&
      current.leaseExpiresAt < new Date();
    if (current.status !== "manual_action_required" && !expiredLease) {
      return { ok: false as const, status: 409, error: "job_not_ready_for_manual_retry" };
    }
    const now = new Date();
    const [updated] = await db
      .update(integrationJobs)
      .set({
        status: "queued",
        maxAttempts: Math.max(current.maxAttempts, current.attemptCount + 1),
        nextAttemptAt: now,
        lockedAt: null,
        leaseExpiresAt: null,
        lockedBy: null,
        lastErrorCode: "MANUAL_RETRY",
        lastErrorMessage: reason.trim(),
        updatedAt: now,
      })
      .where(
        and(
          eq(integrationJobs.id, id),
          eq(integrationJobs.status, current.status),
          current.lockedBy
            ? eq(integrationJobs.lockedBy, current.lockedBy)
            : sql`${integrationJobs.lockedBy} is null`,
        ),
      )
      .returning();
    if (!updated) return { ok: false as const, status: 409, error: "job_changed" };
    return { ok: true as const, job: view(updated) };
  });
}
