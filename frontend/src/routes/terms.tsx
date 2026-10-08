import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms | Seoul Table" }] }),
  component: () => (
    <div className="container-page py-14 max-w-3xl prose">
      <h1 className="font-display text-4xl font-extrabold">Ordering Terms</h1>
      <p className="mt-4 text-muted-foreground">
        This is a local demo. Its payment buttons do not charge a card or confirm a real order, and
        print jobs may be sent to configured local printers. Pickup times and delivery ETAs are
        estimates. Please inform our team of any allergies before ordering; our kitchen handles
        common allergens and cannot guarantee any item is completely allergen-free.
      </p>
    </div>
  ),
});
