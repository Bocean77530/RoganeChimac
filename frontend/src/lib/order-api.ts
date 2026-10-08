export type FulfillmentStatus = "received" | "preparing" | "ready_for_pickup" |
  "preparing_delivery" | "out_for_delivery" | "completed";

export const progressSteps = {
  pickup: ["received", "preparing", "ready_for_pickup", "completed"],
  delivery: ["received", "preparing", "preparing_delivery", "out_for_delivery", "completed"],
} as const;

export const progressLabels: Record<FulfillmentStatus, string> = {
  received: "Order received",
  preparing: "Preparing your food",
  ready_for_pickup: "Ready for pickup",
  preparing_delivery: "Cooking complete · preparing delivery",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
};

export type SavedOrder = {
  id: string;
  orderNumber: string;
  accessToken: string;
  placedAt: string;
  status: "pending_payment" | "payment_failed" | "paid";
  paidAt: string | null;
  fulfillmentStatus: FulfillmentStatus | null;
  fulfillmentUpdatedAt: string | null;
  method: "pickup" | "delivery";
  scheduledFor: string | null;
  deliveryAddress: string;
  customer: { name: string; phone: string; email: string; notes: string };
  lines: {
    lineId: string;
    itemId: string;
    name: string;
    basePrice: number;
    quantity: number;
    notes: string;
    modifiers: {
      groupId: string;
      groupName: string;
      optionId: string;
      name: string;
      priceDelta: number;
    }[];
  }[];
  totals: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
    itemCount: number;
  };
};

export type MerchantOrder = Omit<SavedOrder, "accessToken">;

export async function getMerchantOrders(token: string): Promise<MerchantOrder[]> {
  const response = await fetch("/api/merchant/orders", {
    headers: { authorization: `Bearer ${token}` }, cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load merchant orders");
  return body.orders as MerchantOrder[];
}

export async function updateMerchantProgress(
  number: string, token: string, status: FulfillmentStatus,
): Promise<MerchantOrder> {
  const response = await fetch(`/api/merchant/orders/${encodeURIComponent(number)}/progress`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not update order status");
  return body.order as MerchantOrder;
}

export async function createOrder(input: unknown, key: string): Promise<SavedOrder> {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not save order");
  return body as SavedOrder;
}

export async function getOrder(number: string, token: string): Promise<SavedOrder> {
  const response = await fetch(`/api/orders/${encodeURIComponent(number)}`, {
    headers: { "x-order-token": token },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load order");
  return body as SavedOrder;
}

export async function simulateDemoPayment(
  number: string,
  token: string,
  result: "success" | "failure",
): Promise<SavedOrder> {
  const response = await fetch(`/api/orders/${encodeURIComponent(number)}/demo-payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-order-token": token },
    body: JSON.stringify({ result }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not simulate payment");
  return body as SavedOrder;
}
