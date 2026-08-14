import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms | Seoul Table" }] }),
  component: () => (
    <div className="container-page py-14 max-w-3xl prose">
      <h1 className="font-display text-4xl font-extrabold">Ordering Terms</h1>
      <p className="mt-4 text-muted-foreground">Orders are confirmed once payment is received. Pickup times and delivery ETAs are estimates and may vary during peak hours. Please inform our team of any allergies before ordering. Our kitchen handles common allergens and cannot guarantee any item is completely allergen-free.</p>
    </div>
  ),
});
