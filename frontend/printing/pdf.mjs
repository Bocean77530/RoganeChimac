import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderTicket } from "./tickets.mjs";

export async function saveTicketPdf(job, directory = resolve("data/receipts")) {
  const number = job.payload?.orderNumber;
  const destination = job.destination;
  if (!/^RC-[0-9A-F]{12}$/.test(number) || !["kitchen", "front"].includes(destination))
    throw new Error("Invalid PDF ticket identity");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const scratch = await mkdtemp(join(tmpdir(), "seoul-ticket-pdf-"));
  await chmod(scratch, 0o700);
  const source = join(scratch, "ticket.txt");
  if (!/^[0-9a-f-]{36}$/i.test(job.id)) throw new Error("Invalid PDF job identity");
  const temporaryPdf = join(directory, `.${number}-${destination}-${job.id}.pdf`);
  const finalPdf = join(directory, `${number}-${destination}-${job.id}.pdf`);
  try {
    await writeFile(source, renderTicket(job), { mode: 0o600 });
    await new Promise((resolvePdf, rejectPdf) => {
      const child = spawn(
        "pango-view",
        [
          "--no-display",
          "--font=AppleGothic 11",
          "--width=196",
          "--wrap=word-char",
          "--margin=15",
          `--output=${temporaryPdf}`,
          source,
        ],
        { stdio: "ignore" },
      );
      const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
      child.on("error", rejectPdf);
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolvePdf();
        else rejectPdf(new Error("pango-view could not create the PDF"));
      });
    });
    const size = (await stat(temporaryPdf)).size;
    const file = await open(temporaryPdf, "r");
    const header = Buffer.alloc(5);
    try {
      await file.read(header, 0, 5, 0);
    } finally {
      await file.close();
    }
    if (header.toString() !== "%PDF-" || size < 100 || size > 10 * 1024 * 1024)
      throw new Error("PDF output was invalid");
    await chmod(temporaryPdf, 0o600);
    await rename(temporaryPdf, finalPdf);
    return finalPdf;
  } finally {
    await rm(source, { force: true });
    await rm(scratch, { recursive: true, force: true });
    await rm(temporaryPdf, { force: true });
  }
}
