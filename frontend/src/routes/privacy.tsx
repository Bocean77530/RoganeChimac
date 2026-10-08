import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy | Seoul Table" }] }),
  component: () => (
    <div className="container-page py-14 max-w-3xl prose">
      <h1 className="font-display text-4xl font-extrabold">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">
        For this local demo, order details (your name, contact details, delivery address, items and
        notes) are saved on the demo server. The payment buttons only simulate success or failure:
        no card details are collected and no money is charged. After a simulated success, a local
        print worker may send tickets containing order details to configured kitchen and front
        printers; the front ticket includes contact and delivery details. Contact us if you need a
        demo order removed.
      </p>
    </div>
  ),
});
