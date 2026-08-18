import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { z } from "zod";
import { adminOrdersClient } from "../../../../components/admin/admin-client";
import { KitchenTicket } from "../../../../components/printing/KitchenTicket";
import { Button } from "../../../../components/ui/button";
import { createKitchenTicket } from "../../../../integrations/printing/kitchen-ticket";
import { restaurant } from "../../../../lib/restaurant";
import kitchenTicketCss from "../../../../styles/kitchen-ticket.css?url";

export const Route = createFileRoute("/admin/print/orders/$orderId")({
  validateSearch: z.object({
    copy: z.coerce.number().int().min(1).catch(1),
  }),
  head: () => ({
    meta: [
      { title: "Kitchen Ticket | Rogane Chimac" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: kitchenTicketCss }],
  }),
  component: KitchenTicketPrintPage,
});

function KitchenTicketPrintPage() {
  const { orderId } = Route.useParams();
  const { copy } = Route.useSearch();
  const orderQuery = useQuery({
    queryKey: ["admin", "orders", orderId],
    queryFn: () => adminOrdersClient.getOrder(orderId),
  });

  if (orderQuery.isPending) {
    return <div className="kitchen-ticket-page text-center">Loading ticket…</div>;
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="kitchen-ticket-page text-center">
        <h1 className="font-display text-2xl font-bold">Ticket unavailable</h1>
        <Button asChild className="mt-5">
          <Link to="/admin">Back to order board</Link>
        </Button>
      </div>
    );
  }

  const ticket = createKitchenTicket({
    order: orderQuery.data,
    restaurantName: restaurant.name,
    copyNumber: copy,
  });

  return (
    <div className="kitchen-ticket-page">
      <div className="kitchen-ticket-page__controls">
        <Button asChild variant="outline">
          <Link to="/admin/orders/$orderId" params={{ orderId }}>
            Back to order
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
        </Button>
      </div>
      <KitchenTicket ticket={ticket} />
    </div>
  );
}
