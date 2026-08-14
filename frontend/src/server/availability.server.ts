import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { and, asc, between, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import type { PickupAvailability, PickupSelection } from "@/domain/availability";
import type { ServiceResult } from "@/domain/common";
import { withDatabase, type DatabaseExecutor } from "@/db/client.server";
import { businessHours, pickupSlots, specialHours, type restaurants } from "@/db/schema";
import { findRestaurantBySlug } from "./repositories/menu-repository.server";
import { failure, internalError, serviceError, success } from "./service-errors.server";

type RestaurantRow = typeof restaurants.$inferSelect;

export type OpeningPeriod = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
};

export type SpecialOpening = {
  serviceDate: string;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type CandidateSlot = { startsAt: Date; endsAt: Date };

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function partsInTimeZone(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function localDateKey(parts: Pick<LocalParts, "year" | "month" | "day">): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function addLocalDays(parts: LocalParts, days: number): LocalParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
    minute: 0,
  };
}

function timeToMinutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function zonedLocalToUtc(parts: LocalParts, timeZone: string): Date | null {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let guess = desired;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsInTimeZone(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const delta = desired - actualAsUtc;
    guess += delta;
    if (delta === 0) break;
  }

  const result = new Date(guess);
  const verified = partsInTimeZone(result, timeZone);
  return verified.year === parts.year &&
    verified.month === parts.month &&
    verified.day === parts.day &&
    verified.hour === parts.hour &&
    verified.minute === parts.minute
    ? result
    : null;
}

export function buildCandidateSlots(input: {
  now: Date;
  from: Date;
  timeZone: string;
  prepMinutes: number;
  intervalMinutes: number;
  bookingDays: number;
  openingPeriods: OpeningPeriod[];
  specialOpenings: SpecialOpening[];
}): CandidateSlot[] {
  const threshold = new Date(
    Math.max(input.now.getTime(), input.from.getTime()) + input.prepMinutes * 60_000,
  );
  const firstLocalDay = partsInTimeZone(input.now, input.timeZone);
  const specials = new Map(input.specialOpenings.map((opening) => [opening.serviceDate, opening]));
  const result: CandidateSlot[] = [];

  for (let offset = 0; offset < input.bookingDays; offset += 1) {
    const localDay = addLocalDays(firstLocalDay, offset);
    const dateKey = localDateKey(localDay);
    const special = specials.get(dateKey);
    if (special?.isClosed) continue;

    const dayOfWeek = new Date(
      Date.UTC(localDay.year, localDay.month - 1, localDay.day),
    ).getUTCDay();
    const periods = special
      ? special.opensAt && special.closesAt
        ? [{ dayOfWeek, opensAt: special.opensAt, closesAt: special.closesAt }]
        : []
      : input.openingPeriods.filter((period) => period.dayOfWeek === dayOfWeek);

    for (const period of periods) {
      const openMinutes = timeToMinutes(period.opensAt);
      const closeMinutes = timeToMinutes(period.closesAt);
      for (
        let minute = openMinutes;
        minute + input.intervalMinutes <= closeMinutes;
        minute += input.intervalMinutes
      ) {
        const startsAt = zonedLocalToUtc(
          {
            ...localDay,
            hour: Math.floor(minute / 60),
            minute: minute % 60,
          },
          input.timeZone,
        );
        if (!startsAt || startsAt < threshold) continue;
        result.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + input.intervalMinutes * 60_000),
        });
      }
    }
  }

  return result.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

async function materializeSlots(
  db: DatabaseExecutor,
  restaurant: RestaurantRow,
  now: Date,
  from: Date,
) {
  const firstDay = partsInTimeZone(now, restaurant.timezone);
  const lastDay = addLocalDays(firstDay, restaurant.pickupBookingDays - 1);
  const [hoursRows, specialRows] = await Promise.all([
    db
      .select({
        dayOfWeek: businessHours.dayOfWeek,
        opensAt: businessHours.opensAt,
        closesAt: businessHours.closesAt,
      })
      .from(businessHours)
      .where(eq(businessHours.restaurantId, restaurant.id)),
    db
      .select({
        serviceDate: specialHours.serviceDate,
        isClosed: specialHours.isClosed,
        opensAt: specialHours.opensAt,
        closesAt: specialHours.closesAt,
      })
      .from(specialHours)
      .where(
        and(
          eq(specialHours.restaurantId, restaurant.id),
          between(specialHours.serviceDate, localDateKey(firstDay), localDateKey(lastDay)),
        ),
      ),
  ]);

  const candidates = buildCandidateSlots({
    now,
    from,
    timeZone: restaurant.timezone,
    prepMinutes: restaurant.pickupPrepMinutes,
    intervalMinutes: restaurant.pickupSlotIntervalMinutes,
    bookingDays: restaurant.pickupBookingDays,
    openingPeriods: hoursRows,
    specialOpenings: specialRows,
  });

  if (candidates.length > 0) {
    await db
      .insert(pickupSlots)
      .values(
        candidates.map((slot) => ({
          id: crypto.randomUUID(),
          restaurantId: restaurant.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          capacity: restaurant.pickupCapacityPerSlot,
        })),
      )
      .onConflictDoNothing({
        target: [pickupSlots.restaurantId, pickupSlots.startsAt],
      });
  }

  if (candidates.length === 0) return [];
  return db
    .select()
    .from(pickupSlots)
    .where(
      and(
        eq(pickupSlots.restaurantId, restaurant.id),
        eq(pickupSlots.enabled, true),
        inArray(
          pickupSlots.startsAt,
          candidates.map((candidate) => candidate.startsAt),
        ),
        gt(pickupSlots.capacity, pickupSlots.reservedCount),
      ),
    )
    .orderBy(asc(pickupSlots.startsAt));
}

function formatSlotLabel(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(startsAt);
}

export async function listAvailableSlots(
  db: DatabaseExecutor,
  restaurant: RestaurantRow,
  now: Date,
  from = now,
) {
  return materializeSlots(db, restaurant, now, from);
}

export async function resolvePickupSelection(
  db: DatabaseExecutor,
  restaurant: RestaurantRow,
  selection: PickupSelection,
  now: Date,
) {
  const available = await listAvailableSlots(db, restaurant, now);
  if (selection.mode === "asap") return available[0];
  return available.find((slot) => slot.id === selection.slotId);
}

export async function getPickupAvailability(input: {
  restaurantSlug: string;
  from?: string;
}): Promise<ServiceResult<PickupAvailability>> {
  const now = new Date();
  const from = input.from ? new Date(input.from) : now;
  if (!input.restaurantSlug.trim() || Number.isNaN(from.getTime())) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid availability request."));
  }

  try {
    return await withDatabase(async (db) => {
      const restaurant = await findRestaurantBySlug(db, input.restaurantSlug.trim());
      if (!restaurant) {
        return failure(serviceError("RESTAURANT_NOT_FOUND", "Restaurant not found."));
      }
      if (!restaurant.orderingEnabled) {
        return success({
          serverNow: now.toISOString(),
          timezone: restaurant.timezone,
          orderingEnabled: false,
          slots: [],
        });
      }

      const rows = await listAvailableSlots(db, restaurant, now, from);
      return success({
        serverNow: now.toISOString(),
        timezone: restaurant.timezone,
        orderingEnabled: true,
        slots: rows.map((slot, index) => ({
          id: slot.id,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          localLabel: formatSlotLabel(slot.startsAt, restaurant.timezone),
          remaining: Math.max(0, slot.capacity - slot.reservedCount),
          asap: index === 0,
        })),
      });
    });
  } catch (error) {
    console.error("Failed to load pickup availability", error);
    return failure(internalError());
  }
}

export const getPickupAvailabilityServerFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      restaurantSlug: z.string().trim().min(1).max(80),
      from: z.string().datetime().optional(),
    }),
  )
  .handler(({ data }) => getPickupAvailability(data));
