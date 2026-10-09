import "@tanstack/react-start/server-only";

import { timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { withDatabase } from "@/db/client.server";
import { integrationJobs, orders } from "@/db/schema";
import type { LocalPrintDestination, LocalPrintPayload } from "@/domain/local-print";
import { requireAdminAccess } from "./admin-auth.server";

type PrintJobRow = typeof integrationJobs.$inferSelect;

type V2Cutoff = {
  at: Date | null;
  unavailableReason: "v2_cutoff_not_configured" | "v2_cutoff_invalid" | null;
};

function v2Cutoff(): V2Cutoff {
  const raw = process.env.PRINT_V2_CREATED_AFTER;
  if (!raw) return { at: null, unavailableReason: "v2_cutoff_not_configured" };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw))
    return { at: null, unavailableReason: "v2_cutoff_invalid" };
  const at = new Date(raw);
  if (!Number.isFinite(at.getTime()) || at.toISOString() !== raw)
    return { at: null, unavailableReason: "v2_cutoff_invalid" };
  return { at, unavailableReason: null };
}

function v2SkipReason(
  row: { payloadVersion: number; createdAt: Date; status: string },
  cutoff: V2Cutoff,
) {
  if (row.payloadVersion !== 2 || ["succeeded", "cancelled", "dead_letter"].includes(row.status))
    return null;
  if (!cutoff.at) return cutoff.unavailableReason;
  return row.createdAt < cutoff.at ? "v2_created_before_cutoff" : null;
}

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
    payloadVersion: row.payloadVersion,
    payload,
    ...(leaseToken ? { leaseToken } : {}),
    status: row.status,
  };
}

const compatiblePayload = sql`
  jsonb_typeof(${integrationJobs.payload}->'items') = 'array'
  and ${integrationJobs.payload}->>'destination' in ('kitchen', 'front')
  and (
    (${integrationJobs.payloadVersion} = 1
      and ${integrationJobs.payload}->>'schemaVersion' = '1'
      and ${integrationJobs.payload}->>'method' = 'pickup')
    or
    (${integrationJobs.payloadVersion} = 2
      and ${integrationJobs.payload}->>'schemaVersion' = '2'
      and ${integrationJobs.payload}->>'method' = 'dine_in'
      and ${integrationJobs.payload}->'table'->>'label' is not null
      and (
        (${integrationJobs.payload}->'payment'->>'method' = 'pay_at_counter'
          and ${integrationJobs.payload}->'payment'->>'status' = 'unpaid')
        or
        (${integrationJobs.payload}->'payment'->>'method' = 'online'
          and ${integrationJobs.payload}->'payment'->>'status' = 'paid'
          and ${integrationJobs.payload}->'payment'->>'paidAt' is not null)
      ))
  )
`;

const compatibleOrder = sql`
  (
    (${integrationJobs.payloadVersion} = 1
      and ${orders.fulfillmentMethod} = 'pickup'
      and ${orders.paymentMethod} = 'online'
      and ${orders.paymentStatus} in ('paid', 'partially_refunded'))
    or
    (${integrationJobs.payloadVersion} = 2
      and ${orders.fulfillmentMethod} = 'dine_in'
      and (
        (${integrationJobs.payload}->'payment'->>'method' = 'online'
          and ${orders.paymentMethod} = 'online'
          and ${orders.paymentStatus} = 'paid')
        or
        (${integrationJobs.payload}->'payment'->>'method' = 'pay_at_counter'
          and ${orders.paymentMethod} = 'pay_at_counter')
      ))
  )
`;

function cutoffFilter(cutoff: V2Cutoff) {
  return cutoff.at
    ? sql`(${integrationJobs.payloadVersion} = 1 or
        (${integrationJobs.payloadVersion} = 2 and ${integrationJobs.createdAt} >= ${cutoff.at}))`
    : eq(integrationJobs.payloadVersion, 1);
}

export async function listLocalPrintJobs() {
  const cutoff = v2Cutoff();
  return withDatabase(async (db) => {
    const rows = await db
      .select()
      .from(integrationJobs)
      .innerJoin(orders, eq(integrationJobs.orderId, orders.id))
      .where(
        and(
          eq(integrationJobs.provider, "local_worker"),
          eq(integrationJobs.kind, "kitchen_print"),
          compatiblePayload,
          compatibleOrder,
          cutoffFilter(cutoff),
          sql`${orders.status} not in ('cancelled', 'expired')`,
          inArray(integrationJobs.status, ["queued", "retry_scheduled"]),
        ),
      )
      .orderBy(asc(integrationJobs.createdAt), asc(integrationJobs.id))
      .limit(50);
    return rows.map((row) => view(row.integration_jobs));
  });
}

export async function listMerchantPrintJobs(adminToken: string) {
  requireAdminAccess(adminToken);
  const cutoff = v2Cutoff();
  return withDatabase(async (db) => {
    const rows = await db
      .select({
        id: integrationJobs.id,
        orderId: integrationJobs.orderId,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        payloadVersion: integrationJobs.payloadVersion,
        payload: integrationJobs.payload,
        status: integrationJobs.status,
        attemptCount: integrationJobs.attemptCount,
        maxAttempts: integrationJobs.maxAttempts,
        externalId: integrationJobs.externalId,
        lastErrorCode: integrationJobs.lastErrorCode,
        lastErrorMessage: integrationJobs.lastErrorMessage,
        leaseExpiresAt: integrationJobs.leaseExpiresAt,
        createdAt: integrationJobs.createdAt,
        supported: sql`${compatiblePayload} and ${compatibleOrder}`,
      })
      .from(integrationJobs)
      .innerJoin(orders, eq(integrationJobs.orderId, orders.id))
      .where(
        and(
          eq(integrationJobs.provider, "local_worker"),
          eq(integrationJobs.kind, "kitchen_print"),
        ),
      )
      .orderBy(desc(integrationJobs.createdAt))
      .limit(100);
    return rows.map((row) => {
      const payload = row.payload as LocalPrintPayload;
      const closed = row.orderStatus === "cancelled" || row.orderStatus === "expired";
      const skipReason = v2SkipReason(row, cutoff);
      return {
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        destination: ["kitchen", "front"].includes(payload.destination)
          ? payload.destination
          : "unknown",
        payloadVersion: row.payloadVersion,
        status: row.status,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        spoolerJobId: row.externalId,
        lastErrorCode: row.lastErrorCode,
        lastErrorMessage: row.lastErrorMessage,
        leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
        supported: Boolean(row.supported),
        skipReason,
        v2CutoffAt: cutoff.at?.toISOString() ?? null,
        canRetry:
          !closed &&
          Boolean(row.supported) &&
          !skipReason &&
          (row.status === "manual_action_required" ||
            (row.status === "processing" &&
              Boolean(row.leaseExpiresAt && row.leaseExpiresAt < new Date()))),
      };
    });
  });
}

export async function claimLocalPrintJob() {
  const cutoff = v2Cutoff();
  return withDatabase((db) =>
    db.transaction(async (tx) => {
      const candidate = await tx.execute<{ id: string }>(sql`
        SELECT j.id FROM integration_jobs j
        JOIN orders o ON o.id = j.order_id
        WHERE j.provider = 'local_worker'
          AND j.kind = 'kitchen_print'
          AND j.status IN ('queued', 'retry_scheduled')
          AND j.next_attempt_at <= now()
          AND o.status NOT IN ('cancelled', 'expired')
          AND (
            (j.payload_version = 1 AND o.fulfillment_method = 'pickup'
              AND o.payment_method = 'online'
              AND o.payment_status IN ('paid', 'partially_refunded'))
            OR
            (j.payload_version = 2 AND o.fulfillment_method = 'dine_in'
              AND (
                (j.payload->'payment'->>'method' = 'online'
                  AND o.payment_method = 'online' AND o.payment_status = 'paid')
                OR
                (j.payload->'payment'->>'method' = 'pay_at_counter'
                  AND o.payment_method = 'pay_at_counter')
              ))
          )
          AND jsonb_typeof(j.payload->'items') = 'array'
          AND ${
            cutoff.at
              ? sql`(j.payload_version = 1 or
                (j.payload_version = 2 and j.created_at >= ${cutoff.at}))`
              : sql`j.payload_version = 1`
          }
          AND j.payload->>'destination' IN ('kitchen', 'front')
          AND (
            (j.payload_version = 1 AND j.payload->>'schemaVersion' = '1'
              AND j.payload->>'method' = 'pickup')
            OR
            (j.payload_version = 2 AND j.payload->>'schemaVersion' = '2'
              AND j.payload->>'method' = 'dine_in'
              AND j.payload->'table'->>'label' IS NOT NULL
              AND (
                (j.payload->'payment'->>'method' = 'pay_at_counter'
                  AND j.payload->'payment'->>'status' = 'unpaid')
                OR
                (j.payload->'payment'->>'method' = 'online'
                  AND j.payload->'payment'->>'status' = 'paid'
                  AND j.payload->'payment'->'paidAt' IS NOT NULL)
              ))
          )
        ORDER BY j.created_at, j.id
        FOR UPDATE OF j SKIP LOCKED
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
      (current.status === "succeeded" &&
        report.result === "queued" &&
        current.externalId === report.spoolerJobId) ||
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
    if (!updated) {
      const [latest] = await db
        .select()
        .from(integrationJobs)
        .where(eq(integrationJobs.id, id))
        .limit(1);
      if (
        latest?.lockedBy === report.leaseToken &&
        ((latest.status === "succeeded" &&
          report.result === "queued" &&
          latest.externalId === report.spoolerJobId) ||
          (["retry_scheduled", "manual_action_required"].includes(latest.status) &&
            report.result === "failed"))
      )
        return { ok: true as const, job: view(latest) };
      return { ok: false as const, status: 409, error: "lease_not_active" };
    }
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
    if (v2SkipReason(current, v2Cutoff()))
      return { ok: false as const, status: 409, error: "v2_cutoff_not_met" };
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, current.orderId))
      .limit(1);
    if (!order || order.status === "cancelled" || order.status === "expired")
      return { ok: false as const, status: 409, error: "order_closed" };
    const [compatibility] = await db
      .select({ supported: sql`${compatiblePayload} and ${compatibleOrder}` })
      .from(integrationJobs)
      .innerJoin(orders, eq(integrationJobs.orderId, orders.id))
      .where(eq(integrationJobs.id, id))
      .limit(1);
    if (!compatibility?.supported)
      return { ok: false as const, status: 409, error: "unsupported_payload" };
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
