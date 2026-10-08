import { createFileRoute } from "@tanstack/react-router";
import { requirePrintWorker, retryLocalPrintJob } from "@/server/local-print-jobs.server";

export const Route = createFileRoute("/api/local-print-jobs/$jobId/retry")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = requirePrintWorker(request);
        if (denied) return denied;
        const body = await request.json().catch(() => null);
        const result = await retryLocalPrintJob(
          params.jobId,
          typeof body?.reason === "string" ? body.reason : "",
        );
        return result.ok
          ? Response.json({ job: result.job })
          : Response.json({ error: result.error }, { status: result.status });
      },
    },
  },
});
