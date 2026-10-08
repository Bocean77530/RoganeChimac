import type { Currency } from "./common";
import type { PickupSelection } from "./availability";

export type OrderStatus =
  | "pending_payment"
  | "submitted"
  | "paid"
  | "accepted"
  | "preparing"
  | "ready"
  | "collected"
  | "expired"
  | "cancelled";

export type PaymentStatus =
  "unpaid" | "pending" | "paid" | "failed" | "partially_refunded" | "refunded";

export type CheckoutDraftLine = {
  clientLineId: string;
  menuItemId: string;
  quantity: number;
  modifierOptionIds: string[];
  notes?: string;
};

export type QuoteOrderInput = {
  restaurantSlug: string;
  fulfillment: PickupSelection | { type: "dine_in"; mode: "table"; tableCode: string };
  paymentMethod?: "online" | "pay_at_counter";
  lines: CheckoutDraftLine[];
  promoCode?: string;
};

export type PricedModifierSnapshot = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaCents: number;
};

export type PricedLineSnapshot = {
  clientLineId: string;
  menuItemId: string;
  name: string;
  koreanName?: string;
  unitPriceCents: number;
  quantity: number;
  modifiers: PricedModifierSnapshot[];
  notes?: string;
  lineTotalCents: number;
};

export type OrderTotalsSnapshot = {
  currency: Currency;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export type OrderQuote = {
  quoteId: string;
  expiresAt: string;
  fulfillment:
    | { type: "pickup"; slotId: string; pickupAt: string }
    | { type: "dine_in"; tableId: string; tableLabel: string };
  paymentMethod: "online" | "pay_at_counter";
  lines: PricedLineSnapshot[];
  totals: OrderTotalsSnapshot;
};

export type CustomerDetails = {
  name: string;
  phone: string;
  email: string;
};

export type CreateOrderInput = {
  quoteId: string;
  attemptId: string;
  customer: CustomerDetails;
  notes?: string;
  termsAccepted: true;
  termsVersion: string;
};

export type CreatedOrder = {
  id: string;
  orderNumber: string;
  trackingToken: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillment: { type: "pickup"; pickupAt: string } | { type: "dine_in"; tableLabel: string };
  pickupAt?: string;
  customerEmail: string;
  totals: OrderTotalsSnapshot;
};

export type PendingOrder = CreatedOrder & {
  status: "pending_payment";
  paymentStatus: "pending";
  fulfillment: { type: "pickup"; pickupAt: string };
  pickupAt: string;
};

export type OrderStatusEvent = {
  from: OrderStatus | null;
  to: OrderStatus;
  occurredAt: string;
  label: string;
};

export type PublicOrderView = {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentMethod: "pickup" | "dine_in";
  tableLabel: string | null;
  pickupAt: string;
  placedAt: string | null;
  maskedEmail: string;
  lines: PricedLineSnapshot[];
  totals: OrderTotalsSnapshot;
  timeline: OrderStatusEvent[];
};

export type AdminOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentMethod: "pickup" | "dine_in";
  tableLabel?: string | null;
  placedAt: string;
  requestedFor: string;
  readyBy: string | null;
  customerName: string;
  itemCount: number;
  totalCents: number;
  currency: Currency;
  version: number;
};

export type AdminOrderDetail = AdminOrderSummary & {
  customerPhone: string;
  customerEmail: string;
  customerNotes: string | null;
  lines: PricedLineSnapshot[];
  totals: OrderTotalsSnapshot;
  statusEvents: OrderStatusEvent[];
};
