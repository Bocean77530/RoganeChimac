import type {
  IntegrationJobStatus,
  IntegrationKind,
  IntegrationState,
} from "../../domain/integrations";
import type { AdminOrderDetail, OrderStatus, PricedLineSnapshot } from "../../domain/order";

export type AdminOrderView = AdminOrderDetail & {
  integrations: Record<IntegrationKind, IntegrationState>;
};

export type AdminIntegrationJob = {
  id: string;
  orderId: string;
  kind: IntegrationKind;
  provider: string;
  status: IntegrationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  externalReference?: string;
  updatedAt: string;
};

export type TransitionOrderInput = {
  orderId: string;
  expectedVersion: number;
  to: OrderStatus;
  idempotencyKey: string;
};

export interface AdminOrdersClient {
  listOrders(): Promise<AdminOrderView[]>;
  getOrder(orderId: string): Promise<AdminOrderView | null>;
  listIntegrationJobs(orderId: string): Promise<AdminIntegrationJob[]>;
  transitionOrder(input: TransitionOrderInput): Promise<AdminOrderView>;
  retryIntegrationJob(jobId: string): Promise<AdminIntegrationJob>;
}

export class AdminClientError extends Error {
  constructor(
    readonly code:
      | "ORDER_NOT_FOUND"
      | "ORDER_VERSION_CONFLICT"
      | "INVALID_STATUS_TRANSITION"
      | "INTEGRATION_JOB_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AdminClientError";
  }
}

const allowedTransitions: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "collected",
};

export function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  return allowedTransitions[status] ?? null;
}

class MockAdminOrdersClient implements AdminOrdersClient {
  private orders = createMockOrders();
  private jobs = createMockJobs();
  private readonly transitionResults = new Map<
    string,
    { orderId: string; to: OrderStatus; result: AdminOrderView }
  >();

  async listOrders(): Promise<AdminOrderView[]> {
    return clone(this.orders).sort(
      (left, right) => Date.parse(left.requestedFor) - Date.parse(right.requestedFor),
    );
  }

  async getOrder(orderId: string): Promise<AdminOrderView | null> {
    const order = this.orders.find((candidate) => candidate.id === orderId);
    return order ? clone(order) : null;
  }

  async listIntegrationJobs(orderId: string): Promise<AdminIntegrationJob[]> {
    return clone(
      this.jobs
        .filter((job) => job.orderId === orderId)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    );
  }

  async transitionOrder(input: TransitionOrderInput): Promise<AdminOrderView> {
    const replay = this.transitionResults.get(input.idempotencyKey);
    if (replay) {
      if (replay.orderId !== input.orderId || replay.to !== input.to) {
        throw new AdminClientError(
          "INVALID_STATUS_TRANSITION",
          "The idempotency key was already used for another transition.",
        );
      }
      return clone(replay.result);
    }

    const orderIndex = this.orders.findIndex((order) => order.id === input.orderId);
    if (orderIndex < 0) {
      throw new AdminClientError("ORDER_NOT_FOUND", "Order not found.");
    }

    const current = this.orders[orderIndex];
    if (!current) throw new AdminClientError("ORDER_NOT_FOUND", "Order not found.");
    if (current.version !== input.expectedVersion) {
      throw new AdminClientError(
        "ORDER_VERSION_CONFLICT",
        "This order was updated on another device. Refresh and try again.",
      );
    }

    if (getNextOrderStatus(current.status) !== input.to) {
      throw new AdminClientError(
        "INVALID_STATUS_TRANSITION",
        `Cannot move an order from ${current.status} to ${input.to}.`,
      );
    }

    const occurredAt = new Date().toISOString();
    const updated: AdminOrderView = {
      ...current,
      status: input.to,
      version: current.version + 1,
      statusEvents: [
        ...current.statusEvents,
        {
          from: current.status,
          to: input.to,
          occurredAt,
          label: statusLabel(input.to),
        },
      ],
    };

    if (input.to === "accepted") {
      updated.integrations = {
        ...updated.integrations,
        kitchen_print: {
          kind: "kitchen_print",
          provider: "mock_print",
          status: "queued",
          attemptCount: 0,
        },
      };
      this.ensurePrintJob(updated, occurredAt);
    }

    this.orders[orderIndex] = updated;
    this.transitionResults.set(input.idempotencyKey, {
      orderId: input.orderId,
      to: input.to,
      result: clone(updated),
    });
    return clone(updated);
  }

  async retryIntegrationJob(jobId: string): Promise<AdminIntegrationJob> {
    const jobIndex = this.jobs.findIndex((job) => job.id === jobId);
    if (jobIndex < 0) {
      throw new AdminClientError("INTEGRATION_JOB_NOT_FOUND", "Integration job not found.");
    }

    const current = this.jobs[jobIndex];
    if (!current) {
      throw new AdminClientError("INTEGRATION_JOB_NOT_FOUND", "Integration job not found.");
    }

    const updated: AdminIntegrationJob = {
      ...current,
      status: "queued",
      nextAttemptAt: undefined,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.jobs[jobIndex] = updated;

    const orderIndex = this.orders.findIndex((order) => order.id === current.orderId);
    const order = this.orders[orderIndex];
    if (order) {
      this.orders[orderIndex] = {
        ...order,
        integrations: {
          ...order.integrations,
          [current.kind]: {
            kind: current.kind,
            provider: current.provider,
            status: "queued",
            attemptCount: current.attemptCount,
          },
        },
      };
    }

    return clone(updated);
  }

  private ensurePrintJob(order: AdminOrderView, occurredAt: string): void {
    if (this.jobs.some((job) => job.orderId === order.id && job.kind === "kitchen_print")) return;

    this.jobs.push({
      id: `job-print-${order.id}`,
      orderId: order.id,
      kind: "kitchen_print",
      provider: "mock_print",
      status: "queued",
      attemptCount: 0,
      maxAttempts: 6,
      updatedAt: occurredAt,
    });
  }
}

export function createMockAdminOrdersClient(): AdminOrdersClient {
  return new MockAdminOrdersClient();
}

export const adminOrdersClient: AdminOrdersClient = createMockAdminOrdersClient();

function createMockOrders(): AdminOrderView[] {
  return [
    createMockOrder({
      id: "order-st-1042",
      orderNumber: "RC-1042",
      status: "paid",
      placedAt: "2026-08-14T09:32:00.000Z",
      requestedFor: "2026-08-14T10:00:00.000Z",
      customerName: "Amelia Wong",
      customerPhone: "0412 345 678",
      customerEmail: "amelia@example.com",
      customerNotes: "Peanut allergy. Please use a clean knife.",
      lines: [
        line("line-1042-1", "kfc", "Korean Fried Chicken", 1_790, 1, [
          modifier("portion", "Portion", "half", "Half"),
          modifier("flavour", "Flavour", "soy-garlic", "Soy Garlic"),
        ]),
        line("line-1042-2", "rice", "Steamed Rice", 350, 2),
      ],
      posStatus: "succeeded",
      printStatus: "queued",
    }),
    createMockOrder({
      id: "order-st-1043",
      orderNumber: "RC-1043",
      status: "accepted",
      placedAt: "2026-08-14T09:35:00.000Z",
      requestedFor: "2026-08-14T10:10:00.000Z",
      customerName: "Daniel Park",
      customerPhone: "0491 100 220",
      customerEmail: "daniel@example.com",
      customerNotes: null,
      lines: [line("line-1043-1", "bibimbap", "Classic Bibimbap", 1_990, 2)],
      posStatus: "retry_scheduled",
      printStatus: "succeeded",
    }),
    createMockOrder({
      id: "order-st-1044",
      orderNumber: "RC-1044",
      status: "preparing",
      placedAt: "2026-08-14T09:37:00.000Z",
      requestedFor: "2026-08-14T10:20:00.000Z",
      customerName: "Priya Singh",
      customerPhone: "0408 887 700",
      customerEmail: "priya@example.com",
      customerNotes: "Extra napkins please.",
      lines: [line("line-1044-1", "bbq-set", "Korean BBQ Sharing Set", 6_990, 1)],
      posStatus: "manual_action_required",
      printStatus: "succeeded",
    }),
    createMockOrder({
      id: "order-st-1045",
      orderNumber: "RC-1045",
      status: "ready",
      placedAt: "2026-08-14T09:18:00.000Z",
      requestedFor: "2026-08-14T09:50:00.000Z",
      customerName: "Marcus Lee",
      customerPhone: "0422 404 555",
      customerEmail: "marcus@example.com",
      customerNotes: null,
      lines: [line("line-1045-1", "tteokbokki", "Tteokbokki", 1_690, 1)],
      posStatus: "succeeded",
      printStatus: "succeeded",
    }),
  ];
}

type MockOrderInput = {
  id: string;
  orderNumber: string;
  status: Extract<OrderStatus, "paid" | "accepted" | "preparing" | "ready">;
  placedAt: string;
  requestedFor: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes: string | null;
  lines: PricedLineSnapshot[];
  posStatus: IntegrationJobStatus;
  printStatus: IntegrationJobStatus;
};

function createMockOrder(input: MockOrderInput): AdminOrderView {
  const subtotalCents = input.lines.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const itemCount = input.lines.reduce((sum, item) => sum + item.quantity, 0);
  const totals = {
    currency: "AUD" as const,
    subtotalCents,
    discountCents: 0,
    totalCents: subtotalCents,
  };

  return {
    id: input.id,
    orderNumber: input.orderNumber,
    status: input.status,
    paymentStatus: "paid",
    fulfillmentMethod: "pickup",
    placedAt: input.placedAt,
    requestedFor: input.requestedFor,
    readyBy: input.requestedFor,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    customerNotes: input.customerNotes,
    itemCount,
    totalCents: subtotalCents,
    currency: "AUD",
    version: statusVersion(input.status),
    lines: input.lines,
    totals,
    statusEvents: [
      {
        from: "pending_payment",
        to: "paid",
        occurredAt: input.placedAt,
        label: "Payment confirmed",
      },
    ],
    integrations: {
      pos: {
        kind: "pos",
        provider: "mock_pos",
        status: input.posStatus,
        attemptCount: input.posStatus === "succeeded" ? 1 : 3,
        lastError:
          input.posStatus === "succeeded" ? undefined : "Mock POS did not acknowledge the order.",
      },
      kitchen_print: {
        kind: "kitchen_print",
        provider: "mock_print",
        status: input.printStatus,
        attemptCount: input.printStatus === "succeeded" ? 1 : 0,
      },
    },
  };
}

function line(
  clientLineId: string,
  menuItemId: string,
  name: string,
  unitPriceCents: number,
  quantity: number,
  modifiers: PricedLineSnapshot["modifiers"] = [],
): PricedLineSnapshot {
  const modifierTotal = modifiers.reduce((sum, item) => sum + item.priceDeltaCents, 0);
  return {
    clientLineId,
    menuItemId,
    name,
    unitPriceCents,
    quantity,
    modifiers,
    lineTotalCents: (unitPriceCents + modifierTotal) * quantity,
  };
}

function modifier(
  groupId: string,
  groupName: string,
  optionId: string,
  optionName: string,
  priceDeltaCents = 0,
): PricedLineSnapshot["modifiers"][number] {
  return { groupId, groupName, optionId, optionName, priceDeltaCents };
}

function createMockJobs(): AdminIntegrationJob[] {
  return [
    {
      id: "job-pos-order-st-1042",
      orderId: "order-st-1042",
      kind: "pos",
      provider: "mock_pos",
      status: "succeeded",
      attemptCount: 1,
      maxAttempts: 6,
      externalReference: "MOCK-POS-RC-1042",
      updatedAt: "2026-08-14T09:32:02.000Z",
    },
    {
      id: "job-pos-order-st-1043",
      orderId: "order-st-1043",
      kind: "pos",
      provider: "mock_pos",
      status: "retry_scheduled",
      attemptCount: 3,
      maxAttempts: 6,
      nextAttemptAt: "2026-08-14T09:45:00.000Z",
      lastError: "Mock POS did not acknowledge the order.",
      updatedAt: "2026-08-14T09:40:00.000Z",
    },
    {
      id: "job-print-order-st-1043",
      orderId: "order-st-1043",
      kind: "kitchen_print",
      provider: "mock_print",
      status: "succeeded",
      attemptCount: 1,
      maxAttempts: 6,
      externalReference: "MOCK-PRINT-RC-1043-COPY-1",
      updatedAt: "2026-08-14T09:36:00.000Z",
    },
    {
      id: "job-pos-order-st-1044",
      orderId: "order-st-1044",
      kind: "pos",
      provider: "mock_pos",
      status: "manual_action_required",
      attemptCount: 3,
      maxAttempts: 6,
      lastError: "Mock POS rejected the menu mapping.",
      updatedAt: "2026-08-14T09:38:00.000Z",
    },
  ];
}

function statusVersion(status: MockOrderInput["status"]): number {
  return { paid: 1, accepted: 2, preparing: 3, ready: 4 }[status];
}

function statusLabel(status: OrderStatus): string {
  return {
    pending_payment: "Payment pending",
    paid: "Payment confirmed",
    accepted: "Order accepted",
    preparing: "Preparing",
    ready: "Ready for pickup",
    collected: "Collected",
    expired: "Expired",
    cancelled: "Cancelled",
  }[status];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
