import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "@/lib/seo";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            "User-agent: *",
            "Allow: /",
            "Disallow: /admin",
            "Disallow: /checkout",
            "Disallow: /order-confirmation",
            "Disallow: /track-order",
            `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
            "",
          ].join("\n"),
          {
            headers: {
              "cache-control": "public, max-age=3600",
              "content-type": "text/plain; charset=utf-8",
            },
          },
        ),
    },
  },
});
