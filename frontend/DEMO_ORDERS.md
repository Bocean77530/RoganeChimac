# Local order, printer, PDF and progress demo

This demo saves orders, simulates payment success or failure, then queues separate kitchen and front counter jobs. A Node worker on the shop Mac creates one PDF per ticket and submits the text ticket to a configured `lp` queue. Staff can advance a paid order's progress at `/merchant`; customers can refresh their order link to see the saved progress. No card is charged. A successful `lp` response means the operating system accepted the job; it does not prove that paper came out.

## Run on a local network

1. Install Node.js **24.7 or newer** and run `npm install` in `frontend/` (the project also has a Bun lockfile). The PDF converter is `pango-view`; it is installed on this demo Mac. If missing on another Mac, install Pango (for example `brew install pango`) before starting the worker.
2. Set `ENABLE_DEMO_PAYMENT=1`, a private `PRINT_WORKER_TOKEN`, and a separate private `MERCHANT_TOKEN` in the server environment. On macOS, for example, run `ENABLE_DEMO_PAYMENT=1 PRINT_WORKER_TOKEN='replace-with-a-long-random-secret' MERCHANT_TOKEN='a-different-long-random-secret' npm run dev:demo` in `frontend/`. This starts the Node order API on `127.0.0.1:3001` and the Vite website on `0.0.0.0` with `/api` proxied to that API.
3. Open the Vite network URL shown in the terminal from a phone on the same Wi-Fi, for example `http://192.168.1.20:8080`. Allow local network access in the computer firewall if prompted.
4. On the shop computer, run `lpstat -p -d` and use the exact system queue name. The currently discovered queue is `Brother_HL_L3230CDW_series`. Both destinations may map to this **same** queue for a two-ticket demo. In a second terminal in `frontend/`, first preview without changing job status:

   ```sh
   ORDER_API_BASE_URL=http://127.0.0.1:3001 PRINT_WORKER_TOKEN='replace-with-a-long-random-secret' npm run print:worker -- --dry-run --once
   ```

   This writes the latest order's two text previews to a private temporary directory (file mode `0600`) and prints only the file paths. It does not claim jobs or call `lp`.

5. After checking the preview, run the worker:

   ```sh
   ORDER_API_BASE_URL=http://127.0.0.1:3001 PRINT_WORKER_TOKEN='replace-with-a-long-random-secret' KITCHEN_PRINTER=Brother_HL_L3230CDW_series FRONT_PRINTER=Brother_HL_L3230CDW_series npm run print:worker
   ```

   Add `-- --once` to process all currently pending jobs and exit. `PRINT_POLL_INTERVAL_MS` defaults to `3000` and must be at least `500`. On a separate shop computer, point `ORDER_API_BASE_URL` to the LAN website URL instead of `127.0.0.1`, and keep both machines on a trusted network.

   Before each `lp` submission, the worker uses `pango-view` to create `<order-number>-kitchen.pdf` or `<order-number>-front.pdf` in `frontend/data/receipts/`. Set `PRINT_PDF_DIR` to change that directory. PDF creation failure marks only that print job failed and leaves its printer untouched. The PDF directory is private to the shop computer; the customer website does not expose these files. The read-only `--dry-run` command still writes temporary text previews only.

6. Open `/merchant` from the shop browser, enter `MERCHANT_TOKEN`, and click **Open orders**. New paid orders appear after **Refresh orders**. Each card has the next valid progress button. For delivery, the sequence is received → preparing food → cooking complete/preparing delivery → out for delivery → completed. For pickup, it is received → preparing food → ready for pickup → completed. The customer opens their own `/track-order` link and clicks **Refresh status** after each update. There is no automatic polling or live push.

Run this on a trusted LAN only. External internet access needs a separately configured HTTPS reverse proxy or deployment with a persistent disk; it is **not** configured here. Do not use the Vite development server as the public production server.

The API database defaults to `frontend/data/orders.sqlite` (plus SQLite WAL files while running), which is ignored by Git. Set `ORDER_DB_PATH` to an absolute path before starting to place it elsewhere. Back up this file if demo orders need to be retained. Order links include an access token; anyone with the full link can view that order, so avoid sharing them publicly.

`ENABLE_DEMO_PAYMENT` must be exactly `1` for the simulation endpoint to work. Worker APIs stay disabled until `PRINT_WORKER_TOKEN` is set; merchant APIs stay disabled until `MERCHANT_TOKEN` is set. Give the worker token to the API and shop worker. Enter the separate merchant token only on the staff page. Do not put either token into customer links or commit a filled launchd configuration. `printing/com.seoultable.print-worker.example.plist` is an optional worker startup template; copy and edit it on the shop Mac only after the API and printer work manually. The API and website must also stay running for new orders. This repository does not install or start a system service.

The browser keeps the unfinished order request and its idempotency key in that tab's `sessionStorage`. A refresh and retry with the same order content returns the original saved order; changing the content starts a new attempt. The schedule choices (`+30`, `+60`, `+90`, `+120`) are stored as relative labels in this demo, so they do not become an exact clock time when an order is retried later.

## Verify

Run `npm run test:orders` and `npm run test:printing`. They cover orders and payments, merchant authorization and progress, print-job migration, exclusive claims, expired leases, ACK idempotency, worker authorization, manual retries, restart persistence, distinct ticket contents, separate PDF files, a single destination failure, and read-only previews. Tests do not prove that a physical printer produced paper.

## API contract

- `POST /api/orders` with `Content-Type: application/json` and a UUID `Idempotency-Key` header. Body: `customer` (`name`, `phone`, `email`, optional `notes`), `method` (`pickup` or `delivery`), `scheduledFor` (`null`, `+30`, `+60`, `+90`, `+120`), `deliveryAddress`, optional `promoCode`, and `lines` with `itemId`, `quantity`, optional `notes`, and `modifiers` as `{groupId, optionId}` pairs. Client supplied names and prices are ignored.
- `GET /api/orders/ST-XXXXXXXXXX` with the `X-Order-Token` header returned by POST. The response is the saved order. Invalid or missing tokens return 404.
- `GET /api/merchant/orders` with `Authorization: Bearer <MERCHANT_TOKEN>` returns paid orders without customer access tokens.
- `POST /api/merchant/orders/ST-XXXXXXXXXX/progress` with the merchant Bearer token and `{ "status": "preparing" }` advances a paid order by one valid step. Invalid jumps, backwards moves, and a delivery-only status on pickup return 409.
- `POST /api/orders/ST-XXXXXXXXXX/demo-payment` with the order's `X-Order-Token`, `Content-Type: application/json`, and body exactly `{ "result": "success" }` or `{ "result": "failure" }`. Requires `ENABLE_DEMO_PAYMENT=1`. Success atomically marks the order `paid`, sets `paidAt`, and inserts exactly two pending print jobs. Failure marks it `payment_failed` and creates no jobs. A later successful retry is allowed; a paid order cannot return to failed.
- `GET /api/print-jobs` with `Authorization: Bearer <PRINT_WORKER_TOKEN>` returns `{ "jobs": [...] }` for inspection and dry-run previews; it is read-only.
- `POST /api/print-jobs/claim` with the worker Bearer token claims one pending job atomically and returns `{ "job": { ..., "leaseToken": "..." } }`, or `{ "job": null }`. The lease is two minutes. A lease that expires without a confirmed report moves to `uncertain` on the next claim/report/retry request and is **not** reclaimed automatically.
- `POST /api/print-jobs/:id/report` with the worker Bearer token accepts `leaseToken`, `queueName`, and either `result: "queued"` plus `spoolerJobId`, or `result: "failed"` plus `error`. Repeating the identical report is safe; a wrong or expired lease token is rejected.
- `POST /api/print-jobs/:id/retry` with the worker Bearer token and `{ "reason": "Checked OS queue and confirmed no copy" }` changes only `failed` or `uncertain` jobs back to `pending`. It increments `retryCount` and saves the reason in an audit table. The worker never calls retry automatically.

All amounts are integer Australian cents. The server uses the same menu catalogue and restaurant configuration as the website, verifies the required choices and quantities, and calculates totals before saving. Successful replay with the same key and body returns the original order; a changed body with the same key returns 409.

Each job contains a versioned JSON snapshot. Both jobs include the order identity and times, pickup/delivery method and delivery address, dishes, options, item notes and overall notes. The front counter job also includes customer contact, itemized prices, totals, and `DEMO PAID`. `estimatedFor` is calculated when the simulated payment succeeds, using the selected relative time or the configured ASAP estimate; it is not an actual promised fulfilment time.

## Print failure and manual retry

The worker processes kitchen and front jobs independently. A definite `lp` failure marks only that job `failed`. If `lp` may have accepted a ticket but the result is unknown, the lease becomes `uncertain` after expiry; inspect the printer and `lpstat -o Brother_HL_L3230CDW_series` before retrying. The worker retries a lost API acknowledgement without invoking `lp` again. If the API is temporarily unreachable while claiming, it keeps polling.

List jobs with `curl -H "Authorization: Bearer $PRINT_WORKER_TOKEN" http://127.0.0.1:3001/api/print-jobs`. For a failed or uncertain job, inspect the physical output and OS queue first, then retry only that job:

```sh
curl -X POST -H "Authorization: Bearer $PRINT_WORKER_TOKEN" -H 'Content-Type: application/json' -d '{"reason":"Checked printer and OS queue; no copy was produced"}' http://127.0.0.1:3001/api/print-jobs/JOB_UUID/retry
```

Replace `JOB_UUID` with the job `id` from the list. A queued-to-OS job cannot be retried through this endpoint. This remains a trusted-LAN demo, not a public production system: internet deployment, true payment, operational monitoring, and proof of physical print completion remain outside this stage.

On 7 October 2026, a fictional test order was submitted through the worker with both destinations mapped to `Brother_HL_L3230CDW_series`. CUPS accepted distinct job IDs `Brother_HL_L3230CDW_series-5` and `-6` and later listed both as completed. The shop owner subsequently confirmed that both sheets printed clearly. Those earlier jobs predate the PDF feature; new worker submissions create PDFs.

On 8 October 2026, order `ST-D7AA8455D0` was submitted through the local website API and demo payment endpoint using an isolated test database. The worker created `output/pdf/ST-D7AA8455D0-front.pdf` and `output/pdf/ST-D7AA8455D0-kitchen.pdf`, then submitted Brother jobs `-7` and `-8`. Both PDFs were rendered and inspected; Korean dish text, notes, and the front total were legible. CUPS listed both jobs as completed and the queue returned to idle. The shop owner confirmed that both new sheets printed clearly. Merchant updates to `preparing` and `preparing_delivery` were both returned by the customer order lookup. This verifies the local demo path; it does not constitute an internet production deployment.
