# Railway demo and local Brother worker

The Railway `seoul-table-demo` service hosts the simulated-payment order website and API. Its SQLite database lives on the service's existing `/data` volume. The separate `RoganeChimac` Railway service remains on its newer Stripe/PostgreSQL branch.

The demo website uses HTTP Basic authentication. Sign in with username `demo` and the private `DEMO_SITE_PASSWORD` configured on Railway. The restaurant page at `/merchant` then asks for the separate `MERCHANT_TOKEN`. Neither token belongs in the Git repository or a customer link.

## Keep the shop printer listening

On the shop Mac, install Node.js 24.7 or newer, run `npm install` in `frontend/`, and ensure `pango-view` and `lp` are available. `lpstat -p -d` shows exact printer queue names. Copy `printing/railway-worker.env.example` to `data/railway-worker.env`, fill in the public demo URL and the same `PRINT_WORKER_TOKEN` used by Railway, then restrict the file to the shop account with `chmod 600 data/railway-worker.env`.

Run this one command from `frontend/`:

```sh
npm run print:railway
```

Leave that terminal running while the demo accepts orders. The script polls Railway every three seconds, creates one private kitchen PDF and one private front PDF per paid order, and sends their corresponding tickets to the configured local queues. Both queues can name the same Brother printer. PDFs default to `frontend/data/receipts/`; set `PRINT_PDF_DIR` in the private env file to move them. The Railway server never needs direct Wi-Fi access to the printer.

To inspect pending work without claiming or printing it, run `npm run print:railway -- --dry-run --once`. To process only current pending jobs, run `npm run print:railway -- --once`. When closing a long-running worker, press Ctrl+C. Keep the Mac awake and connected to the internet and Brother printer during the demo.

Customer flow: open the demo URL, place a fictional order, choose simulated payment success, and use the private confirmation link to view progress. Merchant flow: open `/merchant`, enter `MERCHANT_TOKEN`, advance the order, then refresh the customer's tracking page. This is a demo deployment with simulated payment; the public `RoganeChimac` production service has a separate Stripe Sandbox workflow.
