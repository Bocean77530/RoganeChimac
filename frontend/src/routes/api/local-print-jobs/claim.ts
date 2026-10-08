import { createFileRoute } from "@tanstack/react-router";
import { claimLocalPrintJob, requirePrintWorker } from "@/server/local-print-jobs.server";

export const Route = createFileRoute("/api/local-print-jobs/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requirePrintWorker(request);
        if (denied) return denied;
        return Response.json(
          { job: await claimLocalPrintJob() },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
