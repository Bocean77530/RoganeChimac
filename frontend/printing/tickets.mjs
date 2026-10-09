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

const width = (character) =>
  /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(
    character,
  )
    ? 2
    : 1;

export function wrapTicketLine(line, maxColumns = 32) {
  const indentation = /^\s*/.exec(line)?.[0] ?? "";
  const continuation = indentation ? indentation + "  " : "  ";
  const output = [];
  let current = indentation;
  let columns = indentation.length;
  for (const word of line.trim().split(/\s+/u)) {
    const wordWidth = [...word].reduce((sum, character) => sum + width(character), 0);
    if (columns > indentation.length && columns + 1 + wordWidth > maxColumns) {
      output.push(current.trimEnd());
      current = continuation;
      columns = continuation.length;
    }
    if (columns > (output.length ? continuation.length : indentation.length)) {
      current += " ";
      columns++;
    }
    for (const character of word) {
      const next = width(character);
      if (columns + next > maxColumns && columns > continuation.length) {
        output.push(current.trimEnd());
        current = continuation;
        columns = continuation.length;
      }
      current += character;
      columns += next;
    }
  }
  output.push(current.trimEnd());
  return output;
}

export function validatePrintJob(job) {
  const payload = job.payload ?? job;
  const version = job.payloadVersion ?? payload.schemaVersion;
  if (
    ![1, 2].includes(version) ||
    payload.schemaVersion !== version ||
    !["kitchen", "front"].includes(payload.destination) ||
    (job.destination && job.destination !== payload.destination) ||
    (version === 1 && payload.method !== "pickup") ||
    (version === 2 && payload.method !== "dine_in") ||
    !Array.isArray(payload.items) ||
    typeof payload.orderNumber !== "string"
  )
    throw new Error("Unsupported print job payload");
  if (version === 2) {
    const payment = payload.payment;
    if (
      !payload.table?.label ||
      !payment ||
      !(
        (payment.method === "online" && payment.status === "paid" && payment.paidAt) ||
        (payment.method === "pay_at_counter" && payment.status === "unpaid")
      )
    )
      throw new Error("Unsupported print job payment state");
  }
  return payload;
}

export function renderTicket(job) {
  const payload = validatePrintJob(job);
  const front = payload.destination === "front";
  const dineIn = payload.schemaVersion === 2;
  const lines = dineIn
    ? [
        front ? "=== FRONT | DINE IN ===" : "=== KITCHEN | DINE IN ===",
        `*** TABLE: ${clean(payload.table.label)} ***`,
        payload.payment.method === "online" ? "PAID ONLINE" : "PAY AT COUNTER",
        ...(payload.payment.method === "pay_at_counter"
          ? ["UNPAID WHEN ORDERED", "Check merchant board for current payment"]
          : []),
        `Order: ${clean(payload.orderNumber)}`,
        `Placed: ${when(payload.placedAt)}`,
        ...(payload.payment.paidAt ? [`Paid: ${when(payload.payment.paidAt)}`] : []),
        "Method: DINE IN",
      ]
    : [
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
  lines.push("--------------------------------");
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
    lines.push("--------------------------------");
    lines.push(`Order note: ${clean(payload.orderNotes)}`);
  }
  if (front) {
    lines.push("--------------------------------");
    lines.push(`Subtotal: ${money(payload.totals.subtotalCents)}`);
    if (payload.totals.discountCents)
      lines.push(`Discount: -${money(payload.totals.discountCents)}`);
    lines.push(`TOTAL: ${money(payload.totals.totalCents)}`);
  }
  return `${lines.flatMap((line) => wrapTicketLine(line)).join("\n")}\n`;
}
