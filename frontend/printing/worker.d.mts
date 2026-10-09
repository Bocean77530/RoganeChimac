export function runWorker(options: {
  api: {
    list: () => Promise<unknown[]>;
    claim: () => Promise<unknown>;
    report: (id: string, result: unknown) => Promise<{ status: string }>;
  };
  queues: { kitchen: string; front: string };
  once?: boolean;
  dryRun?: boolean;
  savePdf?: (job: { id: string }) => Promise<string>;
  submit?: (queue: string, pdfPath: string, title: string) => Promise<string>;
  wait?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
}): Promise<void>;
