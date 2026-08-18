import { createFileRoute } from "@tanstack/react-router";
import { getMenuImage } from "@/server/menu-management.server";

export const Route = createFileRoute("/api/menu-images/$imageId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const image = await getMenuImage(params.imageId);
        if (!image) {
          return new Response("Not found", {
            status: 404,
            headers: { "cache-control": "no-store" },
          });
        }

        const etag = `"${image.sha256}"`;
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, {
            status: 304,
            headers: { etag, "cache-control": "public, max-age=31536000, immutable" },
          });
        }

        const bytes = Uint8Array.from(Buffer.from(image.dataBase64, "base64"));
        return new Response(bytes, {
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-length": String(image.byteSize),
            "content-type": image.contentType,
            etag,
            "last-modified": image.updatedAt.toUTCString(),
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
