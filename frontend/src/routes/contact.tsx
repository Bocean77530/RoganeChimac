import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { restaurant } from "@/lib/restaurant";
import { canonicalLink, pageSeoMeta } from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: pageSeoMeta({
      title: "Contact Rogane Chimac | Korean Restaurant in Dickson",
      description:
        "Find Rogane Chimac at Dickson Plaza, Shop 5/28 Challis Street, Dickson ACT. View opening hours, phone the restaurant or get directions.",
      path: "/contact",
    }),
    links: canonicalLink("/contact"),
  }),
  component: Contact,
});

function Contact() {
  return (
    <div className="container-page py-14 max-w-3xl">
      <p className="text-xs uppercase tracking-widest text-primary font-bold">Contact</p>
      <h1 className="mt-1 font-display text-4xl md:text-6xl font-extrabold">
        Contact Rogane Chimac
      </h1>
      <p className="mt-3 text-muted-foreground max-w-xl">
        Call us for current service information or visit us at Dickson Plaza.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <a
          href={`tel:${restaurant.phone}`}
          className="rounded-2xl border border-border bg-card p-5 hover:bg-accent"
        >
          <Phone className="h-5 w-5 text-primary" />
          <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Phone</p>
          <p className="font-semibold">{restaurant.phone}</p>
        </a>
        {restaurant.email && (
          <a
            href={`mailto:${restaurant.email}`}
            className="rounded-2xl border border-border bg-card p-5 hover:bg-accent"
          >
            <Mail className="h-5 w-5 text-primary" />
            <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Email</p>
            <p className="font-semibold">{restaurant.email}</p>
          </a>
        )}
        <div className="rounded-2xl border border-border bg-card p-5">
          <MapPin className="h-5 w-5 text-primary" />
          <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Address</p>
          <p className="font-semibold">
            {restaurant.address.line1}
            <br />
            {restaurant.address.suburb}
          </p>
        </div>
      </div>
    </div>
  );
}
