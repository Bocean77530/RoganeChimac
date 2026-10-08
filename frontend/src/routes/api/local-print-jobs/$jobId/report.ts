import { createFileRoute } from "@tanstack/react-router";
import { reportLocalPrintJob, requirePrintWorker } from "@/server/local-print-jobs.server";

export const Route = createFileRoute("/api/local-print-jobs/$jobId/report")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = requirePrintWorker(request);
        if (denied) return denied;
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return Response.json({ error: "invalid_report" }, { status: 400 });
        }
        const result = await reportLocalPrintJob(params.jobId, body);
        return result.ok
          ? Response.json({ job: result.job })
          : Response.json({ error: result.error }, { status: result.status });
      },
    },
  },
});
