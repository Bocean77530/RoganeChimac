import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const availabilitySchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
  from: z.string().datetime().optional(),
});

const draftLineSchema = z.object({
  clientLineId: z.string().trim().min(1).max(100),
  menuItemId: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  modifierOptionIds: z.array(z.string().trim().min(1).max(100)).max(20),
  notes: z.string().trim().max(300).optional(),
});

const quoteSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
  fulfillment: z.discriminatedUnion("mode", [
    z.object({ type: z.literal("pickup"), mode: z.literal("asap") }),
    z.object({
      type: z.literal("pickup"),
      mode: z.literal("scheduled"),
      slotId: z.string().uuid(),
    }),
  ]),
  lines: z.array(draftLineSchema).min(1).max(50),
  promoCode: z.string().trim().max(64).optional(),
});

const createOrderSchema = z.object({
  quoteId: z.string().uuid(),
  attemptId: z.string().trim().min(8).max(128),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(8).max(32),
    email: z.string().trim().email().max(320),
  }),
  notes: z.string().trim().max(300).optional(),
  termsAccepted: z.literal(true),
  termsVersion: z.string().trim().min(1).max(64),
});

export const getPickupAvailabilityFn = createServerFn({ method: "GET" })
  .validator(availabilitySchema)
  .handler(async ({ data }) => {
    const { getPickupAvailability } = await import("@/server/availability.server");
    return getPickupAvailability(data);
  });

export const quoteOrderFn = createServerFn({ method: "POST" })
  .validator(quoteSchema)
  .handler(async ({ data }) => {
    const { quoteOrder } = await import("@/server/pricing.server");
    return quoteOrder(data);
  });

export const createPendingOrderFn = createServerFn({ method: "POST" })
  .validator(createOrderSchema)
  .handler(async ({ data }) => {
    const { createPendingOrder } = await import("@/server/orders.server");
    return createPendingOrder(data);
  });

export const createStripeCheckoutSessionFn = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { requestStripeCheckoutSession } = await import("@/server/payments.server");
    return requestStripeCheckoutSession(data);
  });

export const getPublicOrderFn = createServerFn({ method: "GET" })
  .validator(z.object({ trackingToken: z.string().trim().min(32).max(128) }))
  .handler(async ({ data }) => {
    const { getPublicOrder } = await import("@/server/public-orders.server");
    return getPublicOrder(data);
  });

export const getPublicOrderByPaymentSessionFn = createServerFn({ method: "GET" })
  .validator(z.object({ sessionId: z.string().trim().min(16).max(255) }))
  .handler(async ({ data }) => {
    const { getPublicOrderByPaymentSession } = await import(
      "@/server/public-orders.server"
    );
    return getPublicOrderByPaymentSession(data);
  });
