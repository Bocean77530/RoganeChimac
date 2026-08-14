import type { KitchenTicket as KitchenTicketData } from "../../domain/integrations";
import { groupLineModifiers } from "../../integrations/printing/kitchen-ticket";

export type KitchenTicketProps = {
  ticket: KitchenTicketData;
  timezone?: string;
};

export function KitchenTicket({ ticket, timezone = "Australia/Melbourne" }: KitchenTicketProps) {
  return (
    <article className="kitchen-ticket" aria-label={`Kitchen ticket ${ticket.order.orderNumber}`}>
      <header className="kitchen-ticket__header">
        <p className="kitchen-ticket__restaurant">{ticket.restaurantName}</p>
        <h1>{ticket.order.orderNumber}</h1>
        {ticket.copyNumber > 1 && (
          <p className="kitchen-ticket__reprint">REPRINT #{ticket.copyNumber}</p>
        )}
        <div className="kitchen-ticket__flags">
          <strong>PICKUP</strong>
          <strong>PAID ONLINE</strong>
        </div>
      </header>

      <dl className="kitchen-ticket__meta">
        <div>
          <dt>Placed</dt>
          <dd>{formatTicketDate(ticket.placedAt, timezone)}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{formatTicketDate(ticket.order.requestedFor, timezone)}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{ticket.order.customerName}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{ticket.order.customerPhone}</dd>
        </div>
      </dl>

      <ol className="kitchen-ticket__items">
        {ticket.order.lines.map((line) => (
          <li key={line.clientLineId}>
            <div className="kitchen-ticket__item-name">
              <strong>{line.quantity}×</strong>
              <span>
                {line.name}
                {line.koreanName ? ` / ${line.koreanName}` : ""}
              </span>
            </div>
            {groupLineModifiers(line.modifiers).map((group) => (
              <p key={`${line.clientLineId}:${group.groupId}`} className="kitchen-ticket__modifier">
                {group.groupName}: {group.optionNames.join(", ")}
              </p>
            ))}
            {line.notes && <p className="kitchen-ticket__line-note">ITEM NOTE: {line.notes}</p>}
          </li>
        ))}
      </ol>

      {ticket.orderNotes && (
        <section className="kitchen-ticket__order-note" aria-label="Order notes">
          <strong>ORDER NOTE / ALLERGY</strong>
          <p>{ticket.orderNotes}</p>
        </section>
      )}

      <footer>
        <p>{ticket.order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</p>
        <p>Kitchen copy</p>
      </footer>
    </article>
  );
}

function formatTicketDate(isoDate: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(isoDate));
}
