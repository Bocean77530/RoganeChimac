import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const token = z.string().min(1).max(256);

export const listMerchantOrdersFn = createServerFn({ method: "POST" })
  .validator(z.object({ adminToken: token }))
  .handler(async ({ data }) => {
    const { listMerchantOrders } = await import("@/server/merchant-orders.server");
    return listMerchantOrders(data.adminToken);
  });

export const updateMerchantOrderFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      adminToken: token,
      orderId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
      toStatus: z.enum(["accepted", "preparing", "ready", "collected"]),
    }),
  )
  .handler(async ({ data }) => {
    const { updateMerchantOrder } = await import("@/server/merchant-orders.server");
    return updateMerchantOrder(data);
  });
