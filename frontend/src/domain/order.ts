import type { Currency } from "./common";
import type { PickupSelection } from "./availability";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "accepted"
  | "preparing"
  | "ready"
  | "collected"
  | "expired"
  | "cancelled";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "partially_refunded"
  | "refunded";

export type CheckoutDraftLine = {
  clientLineId: string;
  menuItemId: string;
  quantity: number;
  modifierOptionIds: string[];
  notes?: string;
};

export type QuoteOrderInput = {
  restaurantSlug: string;
  fulfillment: PickupSelection;
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
  fulfillment: { slotId: string; pickupAt: string };
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

export type PendingOrder = {
  id: string;
  orderNumber: string;
  trackingToken: string;
  status: "pending_payment";
  paymentStatus: "pending";
  pickupAt: string;
  customerEmail: string;
  totals: OrderTotalsSnapshot;
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
  fulfillmentMethod: "pickup";
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
