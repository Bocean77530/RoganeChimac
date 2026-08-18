import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "@/lib/seo";

const INDEXABLE_PATHS = [
  "/",
  "/menu",
  "/korean-fried-chicken-dickson",
  "/order",
  "/about",
  "/contact",
] as const;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const urls = INDEXABLE_PATHS.map(
          (path) => `  <url><loc>${escapeXml(absoluteUrl(path))}</loc></url>`,
        ).join("\n");

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
          {
            headers: {
              "cache-control": "public, max-age=3600",
              "content-type": "application/xml; charset=utf-8",
            },
          },
        );
      },
    },
  },
});

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
