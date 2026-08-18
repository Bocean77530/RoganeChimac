import { createFileRoute } from "@tanstack/react-router";
import { restaurant } from "@/lib/restaurant";
import { canonicalLink, pageSeoMeta } from "@/lib/seo";
import hero from "@/assets/hero-korean.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: pageSeoMeta({
      title: "About Rogane Chimac | Korean Restaurant in Dickson",
      description:
        "Learn about Rogane Chimac, a Korean restaurant in Dickson, Canberra serving Korean favourites for lunch, dinner and pickup.",
      path: "/about",
      imagePath: hero,
    }),
    links: canonicalLink("/about"),
  }),
  component: About,
});

function About() {
  return (
    <div className="container-page py-14">
      <p className="text-xs uppercase tracking-widest text-primary font-bold">Our story</p>
      <h1 className="mt-1 font-display text-4xl md:text-6xl font-extrabold">
        Rogane Chimac in Dickson
      </h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2 items-center">
        <div className="prose prose-lg text-foreground max-w-none">
          <p>
            {restaurant.name} is a Korean restaurant in Dickson, Canberra, serving lunch and dinner
            from Dickson Plaza.
          </p>
          <p>
            Browse the menu online, choose a pickup time and pay securely before collecting your
            order from the restaurant.
          </p>
          <p>
            The restaurant is family-friendly and offers takeaway. Public-holiday trading hours may
            vary, so call ahead when planning a visit.
          </p>
        </div>
        <img
          src={hero}
          alt="Korean food at Rogane Chimac restaurant in Dickson"
          width={1600}
          height={1200}
          decoding="async"
          className="rounded-3xl aspect-square object-cover shadow-lift"
        />
      </div>
    </div>
  );
}
