export type Currency = "AUD";

export type Money = {
  currency: Currency;
  amountCents: number;
};

export type ServiceErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RESTAURANT_NOT_FOUND"
  | "ORDERING_DISABLED"
  | "MENU_ITEM_UNAVAILABLE"
  | "INVALID_MODIFIERS"
  | "PROMO_INVALID"
  | "PICKUP_SLOT_UNAVAILABLE"
  | "QUOTE_EXPIRED"
  | "QUOTE_ALREADY_CONSUMED"
  | "PRICE_CHANGED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "REQUEST_IN_PROGRESS"
  | "ORDER_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "ORDER_VERSION_CONFLICT"
  | "PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_NOT_CONFIRMED"
  | "INTEGRATION_JOB_NOT_FOUND"
  | "INTERNAL_ERROR";

export type ServiceError = {
  code: ServiceErrorCode;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string[]>;
  correlationId?: string;
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };
