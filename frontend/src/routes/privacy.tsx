import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy | Seoul Table" }] }),
  component: () => (
    <div className="container-page py-14 max-w-3xl prose">
      <h1 className="font-display text-4xl font-extrabold">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">We collect the name, phone number, email address and pickup-order details needed to process your order. Card details are entered directly into Stripe Checkout and do not pass through our server. We retain operational and payment records only for legitimate business, support and legal purposes, and we do not sell personal data. Contact us to request access, correction or deletion where applicable.</p>
    </div>
  ),
});
