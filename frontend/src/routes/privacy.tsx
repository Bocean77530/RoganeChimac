import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy | Seoul Table" }] }),
  component: () => (
    <div className="container-page py-14 max-w-3xl prose">
      <h1 className="font-display text-4xl font-extrabold">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">We collect only what we need to process your order — name, contact details, delivery address and payment token — and we never sell your data. Payment details are handled by our PCI-compliant provider. Contact us to request deletion of your data at any time.</p>
    </div>
  ),
});
