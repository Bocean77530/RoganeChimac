import { createFileRoute } from "@tanstack/react-router";
import { listLocalPrintJobs, requirePrintWorker } from "@/server/local-print-jobs.server";

export const Route = createFileRoute("/api/local-print-jobs/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requirePrintWorker(request);
        if (denied) return denied;
        return Response.json(
          { jobs: await listLocalPrintJobs() },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
