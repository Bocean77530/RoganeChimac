import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms | Seoul Table" }] }),
  component: () => (
    <div className="container-page py-14 max-w-3xl prose">
      <h1 className="font-display text-4xl font-extrabold">Ordering Terms</h1>
      <p className="mt-4 text-muted-foreground">A pickup order enters the kitchen only after Stripe confirms payment. Pickup times are estimates and may vary during peak periods. If a payment arrives after an order expires or is cancelled, contact the restaurant and quote the order number. Please include allergy information with the order and speak with our team before collecting; our kitchen handles common allergens and cannot guarantee that any item is completely allergen-free.</p>
    </div>
  ),
});
