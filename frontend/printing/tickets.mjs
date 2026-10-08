const clean = (value) =>
  String(value ?? "")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
const money = (cents) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const when = (iso) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

export function renderTicket(job) {
  const payload = job.payload ?? job;
  if (payload.schemaVersion !== 1 || !["kitchen", "front"].includes(payload.destination))
    throw new Error("Unsupported print job payload");
  const front = payload.destination === "front";
  const lines = [
    front ? "=== FRONT COUNTER ===" : "=== KITCHEN ===",
    "PAID ONLINE",
    `Order: ${clean(payload.orderNumber)}`,
    `Placed: ${when(payload.placedAt)}`,
    `Paid: ${when(payload.paidAt)}`,
    `Pickup: ${when(payload.estimatedFor)}`,
    "Method: PICKUP",
  ];
  if (front) {
    lines.push(`Customer: ${clean(payload.customer.name)}`);
    lines.push(`Phone: ${clean(payload.customer.phone)}`);
  }
  lines.push("----------------------------------------");
  for (const item of payload.items) {
    lines.push(
      `${item.quantity} x ${clean(item.name)}${item.koreanName ? ` (${clean(item.koreanName)})` : ""}`,
    );
    for (const option of item.options)
      lines.push(`  - ${clean(option.groupName)}: ${clean(option.name)}`);
    if (item.notes) lines.push(`  Item note: ${clean(item.notes)}`);
    if (front) lines.push(`  ${money(item.unitPriceCents)} each · ${money(item.lineTotalCents)}`);
  }
  if (payload.orderNotes) {
    lines.push("----------------------------------------");
    lines.push(`Order note: ${clean(payload.orderNotes)}`);
  }
  if (front) {
    lines.push("----------------------------------------");
    lines.push(`Subtotal: ${money(payload.totals.subtotalCents)}`);
    if (payload.totals.discountCents)
      lines.push(`Discount: -${money(payload.totals.discountCents)}`);
    lines.push(`TOTAL: ${money(payload.totals.totalCents)}`);
  }
  return `${lines.join("\n")}\n`;
}
