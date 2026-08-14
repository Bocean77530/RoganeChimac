import { createFileRoute } from "@tanstack/react-router";
import { restaurant } from "@/lib/restaurant";
import hero from "@/assets/hero-korean.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About | Seoul Table" },
      { name: "description", content: "The story behind Seoul Table — modern Korean cooking, shared tables, and honest ingredients in Melbourne." },
      { property: "og:title", content: "About Seoul Table" },
      { property: "og:description", content: "Modern Korean cooking with traditional heart." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="container-page py-14">
      <p className="text-xs uppercase tracking-widest text-primary font-bold">Our story</p>
      <h1 className="mt-1 font-display text-4xl md:text-6xl font-extrabold">A Korean table, shared.</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2 items-center">
        <div className="prose prose-lg text-foreground max-w-none">
          <p>
            {restaurant.name} began with a simple idea: bring the food we grew up eating — sizzling barbecue, warming stews, and lively street food — to a modern Melbourne dining room and to your door.
          </p>
          <p>
            Every dish starts with quality ingredients, traditional technique, and a strong opinion. We ferment our own kimchi, marinate our meats overnight, and double-fry our chicken until it shatters at first bite.
          </p>
          <p>
            Come in for lunch, take it home for dinner, or share a big set with friends. The best Korean meals are always meant to be shared.
          </p>
        </div>
        <img src={hero} alt="Korean feast" className="rounded-3xl aspect-square object-cover shadow-lift" />
      </div>
    </div>
  );
}
