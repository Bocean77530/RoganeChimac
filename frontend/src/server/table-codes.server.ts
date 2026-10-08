import "@tanstack/react-start/server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client.server";
import { restaurantTables, tableCodeRateLimits } from "@/db/schema";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function tableCodeSecret(): string {
  const secret = process.env.DINE_IN_TABLE_CODE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("DINE_IN_TABLE_CODE_SECRET must contain at least 32 characters");
  }
  return secret;
}

function signature(message: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

/** Issued only by trusted provisioning code; this token is the value encoded in a table QR. */
export function signTableCode(
  input: {
    restaurantId: string;
    tableId: string;
    tokenVersion: number;
  },
  secret = tableCodeSecret(),
): string {
  if (
    !uuidPattern.test(input.restaurantId) ||
    !uuidPattern.test(input.tableId) ||
    !Number.isSafeInteger(input.tokenVersion) ||
    input.tokenVersion < 1
  ) {
    throw new Error("Invalid table code fields");
  }
  const message = `v1.${input.restaurantId}.${input.tableId}.${input.tokenVersion}`;
  return `${message}.${signature(message, secret).toString("base64url")}`;
}

export function verifyTableCode(
  token: string,
  expectedRestaurantId: string,
  secret = tableCodeSecret(),
): { tableId: string; tokenVersion: number } | null {
  const match = /^(v1\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.([1-9][0-9]*))\.([A-Za-z0-9_-]{43})$/.exec(
    token,
  );
  if (!match) return null;
  const [, message, restaurantId, tableId, versionText, encodedMac] = match;
  const tokenVersion = Number(versionText);
  if (
    !uuidPattern.test(restaurantId) ||
    !uuidPattern.test(tableId) ||
    !Number.isSafeInteger(tokenVersion) ||
    restaurantId !== expectedRestaurantId
  ) {
    return null;
  }
  const received = Buffer.from(encodedMac, "base64url");
  const expected = signature(message, secret);
  if (
    received.length !== expected.length ||
    received.toString("base64url") !== encodedMac ||
    !timingSafeEqual(received, expected)
  )
    return null;
  return { tableId, tokenVersion };
}

export async function resolveActiveTable(
  db: DatabaseExecutor,
  restaurantId: string,
  token: string,
) {
  const verified = verifyTableCode(token, restaurantId);
  if (!verified) return undefined;
  return (
    await db
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.id, verified.tableId),
          eq(restaurantTables.restaurantId, restaurantId),
          eq(restaurantTables.tokenVersion, verified.tokenVersion),
          eq(restaurantTables.active, true),
        ),
      )
      .limit(1)
  )[0];
}

async function consumeLookupBudget(
  db: DatabaseExecutor,
  scope: string,
  limit: number,
  windowStart: Date,
): Promise<number> {
  const keyHash = createHash("sha256").update(scope).digest("hex");
  const [row] = await db
    .insert(tableCodeRateLimits)
    .values({ keyHash, windowStart, attemptCount: 1 })
    .onConflictDoUpdate({
      target: tableCodeRateLimits.keyHash,
      set: {
        windowStart: sql`case when ${tableCodeRateLimits.windowStart} < ${windowStart} then ${windowStart} else ${tableCodeRateLimits.windowStart} end`,
        attemptCount: sql`case when ${tableCodeRateLimits.windowStart} < ${windowStart} then 1 else least(${tableCodeRateLimits.attemptCount} + 1, ${limit + 1}) end`,
      },
    })
    .returning({ attemptCount: tableCodeRateLimits.attemptCount });
  return row && row.attemptCount <= limit ? row.attemptCount : 0;
}

/** One fixed global key bounds invalid slugs and forged tokens across all app instances. */
export async function allowGlobalTableCodeLookup(db: DatabaseExecutor): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const count = await consumeLookupBudget(db, "table-entry:global", 600, windowStart);
  if (count > 0 && count % 100 === 0) {
    await db
      .delete(tableCodeRateLimits)
      .where(lt(tableCodeRateLimits.windowStart, new Date(now.getTime() - 10 * 60_000)));
  }
  return count > 0;
}

/** Only a valid signed code creates a per-table key, so key count is bounded by provisioned tables. */
export async function allowVerifiedTableCodeLookup(
  db: DatabaseExecutor,
  restaurantId: string,
  token: string,
): Promise<boolean> {
  const verified = verifyTableCode(token, restaurantId);
  if (!verified) return true;
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  return (
    (await consumeLookupBudget(
      db,
      `table-entry:${restaurantId}:${verified.tableId}`,
      30,
      windowStart,
    )) > 0
  );
}
