# Rogane Chimac ordering demo

TanStack Start application demonstrating an Australian restaurant pickup flow with server-side pricing, PostgreSQL order persistence, Stripe Embedded Checkout, public order tracking, a demo kitchen display, and mock POS/printing adapters.

## Current scope

- Public pickup checkout plus a signed-table-code dine-in flow. The dine-in feature flag remains disabled by default until on-site printer and placard checks.
- Stripe Sandbox card payments through Embedded Checkout.
- Standard PostgreSQL persistence with Drizzle migrations and seed data.
- Signed Stripe webhook as the only source of payment success.
- Private-token confirmation and tracking pages backed by the database.
- Database-backed public menu with protected add/delete operations in `/admin/menu`.
- Demo `/admin` KDS with mock data, Mock POS, retry states, and 80mm browser printing.
- Real order board at `/merchant`, protected by `ADMIN_ACCESS_TOKEN`; merchant changes appear on the customer's tracking page.
- Two local printer jobs per eligible order, claimed over HTTPS by the shop Mac. The worker saves kitchen and front PDFs before sending each PDF to `lp`. Pay-at-counter table orders print on submission; online orders print after a verified payment webhook.

The `/admin` KDS remains a presentation surface with mock orders. Use `/merchant` for actual paid orders. The printer bridge runs on the shop Mac, where it can reach the Brother printer. The POS adapter remains a mock.

## Dine-in ordering and local printing

Migration `0003_futuristic_khan.sql` adds `restaurant_tables` and nullable table/slot fields without deleting pickup, payment or integration-job data. Migration `0004_flawless_marvel_apes.sql` permits table orders paid online and adds `counter_payment_records` plus table-code lookup throttling. Phase three adds no database migration. New restaurants and existing rows have `dine_in_enabled = false` by default. Keep production disabled until the actual printers and table placards are checked at the venue.

The server accepts `fulfillment: { type: "dine_in", mode: "table", tableCode }` with `paymentMethod: "online"` or `"pay_at_counter"`. A table code is an HMAC-signed token bound to restaurant ID, table ID and `token_version`; the server checks the signature, restaurant, active flag and current version at entry, quote and order submission. Set a separate `DINE_IN_TABLE_CODE_SECRET` of at least 32 characters. A fixed global lookup budget covers invalid slugs and codes, and valid signed codes also use a per-table budget. PostgreSQL shares these counters across app instances and periodically prunes expired keys.

A pay-at-counter table order is stored as `submitted` / `unpaid` without reserving pickup capacity. Its order transaction inserts exactly two `local_worker` jobs, one kitchen and one front, with frozen schema-v2 table, item, note, total and unpaid payment details. A dine-in online order remains `pending_payment` / `pending` with zero jobs until a verified Stripe webhook succeeds; then it gets exactly two v2 local jobs and no pickup-only POS job. Failed or expired online payments create no jobs. Merchant acceptance and counter-payment recording never create more print jobs. The worker accepts validated v1 pickup and v2 dine-in jobs only after the fixed UTC v2 cutover described below. Unknown versions and old v2 jobs remain unclaimed and appear on `/merchant`. The pay-at-counter ticket records that payment was outstanding **when ordered** and directs staff to the current merchant payment record; it does not claim that payment is still outstanding when printed later.

For a controlled local test, migrate a disposable PostgreSQL database, set the secrets and Stripe Sandbox variables, create table placards with the trusted CLI below, and set `restaurants.dine_in_enabled = true` there only. Open `/order?table=<signed-token>` from a QR. The table label is resolved server-side. Changing tables or switching to pickup clears the current cart; an invalid or empty new table code blocks checkout instead of restoring the previous table. Header and CartDrawer checkout links use the stored table context. Checkout revalidates the table code, then offers Stripe Sandbox online or pay at counter. The latter returns a private `/track-order` link immediately. `/merchant` shows table/payment and per-ticket print status, lets authenticated staff record counter payment, cancel an unpaid **pay-at-counter** order, or manually retry one ticket. An online order awaiting Stripe cannot be cancelled here because a later successful payment could arrive after cancellation. Cancellation removes only queued print jobs; a job already claimed by a worker cannot be withdrawn. Name, phone and email remain required.

The optional database integration test **resets its target database** and runs only when `TEST_DATABASE_URL` names a local database exactly `dine_in_phase1_test`. It applies migrations 0000–0002, seeds existing pickup/payment/print-job rows, applies 0003 and 0004, then checks data retention, table-code validation/rate limiting, both dine-in payment paths, cancellation, idempotency/jobs and the pickup payment event path:

```bash
TEST_DATABASE_URL=postgresql://USER@127.0.0.1:5432/dine_in_phase1_test npm test -- src/server/__tests__/dine-in.integration.test.ts
```

## Trusted table placards

Run this CLI only on a trusted machine with database access. It needs `DATABASE_URL`,
`DINE_IN_TABLE_CODE_SECRET`, and the public `APP_BASE_URL` set to the exact bare
HTTPS origin. The QR renderer needs Python 3 and ReportLab
(`python3 -m pip install reportlab`); set `PLACARD_PYTHON` if it is installed
under a different Python executable. No admin or signing secret is sent to
the browser. The CLI does not print signed URLs to the terminal.

```bash
npm run tables:manage -- create --restaurant rogane-chimac --tables 'T01:Table 1,T02:Table 2' --out data/table-placards
npm run tables:manage -- list --restaurant rogane-chimac
npm run tables:manage -- rotate --restaurant rogane-chimac --code T01 --out data/table-placards
npm run tables:manage -- deactivate --restaurant rogane-chimac --code T02 --out data/table-placards
npm run tables:manage -- render --restaurant rogane-chimac --out data/table-placards
```

`create` can provision up to 100 tables in one transaction. Each active table
gets its own A6 PDF and SVG at
`OUT/restaurantId/tableId/vN/placard.pdf` and `placard.svg`; these paths
are distinct even if restaurants reuse a code or a Mac treats `T01` and
`t01` as the same filename. Each QR encodes
`https://YOUR_DOMAIN/order?table=...`. Scan every physical placard with a
phone before use, and verify the displayed table. Rotation increments its
version, invalidates the old QR immediately, and creates a new version
directory. Print only the version shown by `list`; replace old physical signs
promptly. Rendering writes temporary SVG/PDF files and atomically replaces
each final file. It rechecks the database version and removes stale output
if rotation or deactivation raced with rendering. If rendering fails after
a database change, rerun `render` before putting signs on tables.
Deactivation invalidates the code and removes that table's output subtree,
but cannot remove an already printed sign.

Earlier versions of this CLI wrote `OUT/T01.pdf` and `OUT/T01.svg`. The new
CLI refuses to generate a table while any flat SVG or PDF remains at the output
root, regardless of its name or letter case. Inspect and quarantine those files and any
old physical placards manually; a flat filename does not prove which
restaurant or table it belongs to. Keep generated files private:
their QR codes are bearer-like table credentials and are ignored by Git under
`frontend/data/`.

## V2 printer cutover

`PRINT_V2_CREATED_AFTER` is a server-side, fixed UTC timestamp in the exact
`YYYY-MM-DDTHH:mm:ss.sssZ` form. If it is missing or malformed, the worker
continues processing eligible v1 pickup jobs but **never claims v2 dine-in
jobs**. The merchant print-job panel shows the reason each older v2 ticket
is skipped and prevents its retry. This prevents queued phase-two table
orders from all printing when the new worker is deployed.

Before enabling dine-in in production, leave `dine_in_enabled = false` and
deploy the code with the v2 cutoff unset. Review the existing local-worker
queue on `/merchant`, identify all old queued v2 tickets, and reconcile
them against actual paper/orders. Choose one UTC cutover instant later than
their `created_at` values; save that same value as
`PRINT_V2_CREATED_AFTER` on every app instance and restart them. Keep the
value unchanged across subsequent restarts and deployments. Confirm the
old v2 rows say they predate the cutoff and cannot be claimed, then enable dine-in and place one new
test order. Verify exactly two new v2 tickets are claimed and that both
papers show the correct table and payment wording. Any order created before
the cutoff remains skipped; investigate it manually rather than moving the
cutoff backward. Only then leave the worker running for customers.

## Local setup

Requirements: Bun, Node.js 22 or later, PostgreSQL 15 or later, a Stripe Sandbox, and Stripe CLI for local webhook forwarding.

```bash
bun install --frozen-lockfile
cp .env.example .env.local
```

Fill `.env.local` with test credentials. Use a random `TRACKING_TOKEN_PEPPER` of at least 32 characters. Never commit `.env.local`, `sk_*`, or `whsec_*` values.

For a local PostgreSQL database, `DATABASE_URL` can look like:

```dotenv
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/rogane_chimac"
```

Hosted PostgreSQL connection strings normally include `sslmode=require`; copy the provider's complete value rather than rebuilding it by hand.

Create and seed the test database:

```bash
bun run db:migrate
bun run db:seed
```

Start the app:

```bash
bun run dev
```

The production Node server uses Railway's injected `PORT` automatically:

```bash
bun run build
bun run start
```

In another terminal, forward Stripe Sandbox webhooks:

```bash
stripe listen --forward-to http://localhost:8080/api/stripe/webhook
```

Copy the CLI-provided `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the app. This local secret is different from a Dashboard webhook endpoint secret.

## Railway deployment

This repository is a monorepo. In Railway, create an application service from the GitHub repository and set its root directory to `/frontend`. Railway will then discover `frontend/Dockerfile` and `frontend/railway.json`.

1. Add a PostgreSQL service to the same Railway project.
2. Add the application service variables below before the first deployment.
3. Generate a public domain for the application and set `APP_BASE_URL` to its exact HTTPS origin.
4. Deploy. `railway.json` runs the committed Drizzle migrations before switching traffic and checks `/api/health`.
5. On the first deployment, open an SSH shell for the application service and run `node .output/scripts/seed.mjs` once to install the demo restaurant, hours, menu, modifiers, and promotion.
6. Create the Stripe Sandbox webhook for `https://YOUR_DOMAIN/api/stripe/webhook`, add its endpoint secret as `STRIPE_WEBHOOK_SECRET`, and redeploy.

Application service variables:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_POOL_MAX=10
APP_BASE_URL=https://YOUR_DOMAIN
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_ME
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
PAYMENTS_EXPECT_LIVEMODE=false
QUOTE_TTL_SECONDS=600
PENDING_ORDER_TTL_SECONDS=1860
TRACKING_TOKEN_PEPPER=replace-with-at-least-32-random-characters
ADMIN_ACCESS_TOKEN=replace-with-at-least-24-random-characters
PRINT_WORKER_TOKEN=replace-with-at-least-32-random-characters
# Set PRINT_V2_CREATED_AFTER only after reviewing old queued v2 jobs.
```

`VITE_STRIPE_PUBLISHABLE_KEY` is intentionally public and is passed to the Docker build as a declared build argument. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, and `TRACKING_TOKEN_PEPPER` remain runtime-only secrets. Do not enable Railway skipped builds when changing a `VITE_*` value because Vite embeds it in the browser bundle.

The database is reached over Railway's private network. Do not replace `Postgres.DATABASE_URL` with a public TCP URL unless an external administrative tool specifically needs it.

The printer integration uses the existing PostgreSQL `integration_jobs` table, so phase three adds no schema migration and does not rewrite existing orders. Pickup and online table jobs are created on a newly verified payment success; pay-at-counter table jobs are created when the order is submitted. Historical paid orders are not automatically backfilled or printed.

## Shop printer and order progress

Open `/merchant` on the main Railway URL and enter the existing `ADMIN_ACCESS_TOKEN`. The page lists real pickup and table orders, print-job states, and staff actions. The customer's private `/track-order` page refreshes while the order can still progress.

On the shop Mac, install `pango-view` and confirm that `lp` can reach the
printer. Copy `printing/main-worker.env.example` to `data/main-worker.env`
and set the same `PRINT_WORKER_TOKEN` as Railway. Set `KITCHEN_PRINTER` and
`FRONT_PRINTER` to exact local queue names from `lpstat -p -d`; both may point
to `Brother_HL_L3230CDW_series`. Keep this file private. Run:

```bash
npm run print:main
```

Keep the terminal running while orders are accepted. The worker polls every
three seconds, creates a distinct private PDF for each job under
`data/receipts-main/`, and submits that PDF to the correct local queue.
Kitchen and front PDFs have different content. Files use mode 0600 and the
directory mode 0700. They contain customer information; keep them off shared
drives and set a retention/deletion practice. `npm run print:main -- --dry-run
--once` creates read-only text previews without claiming jobs or printing.
`npm run print:main -- --once` processes current pending jobs and exits after
pending acknowledgements resolve. A successful queue report means the
operating system accepted the job; check the physical printer for paper and
print quality.

If `lp` times out and its outcome is unknown, the job stays in `processing`
to avoid an automatic duplicate. A network failure while reporting a known
`lp` result retries only the acknowledgement; the worker continues claiming
other tickets and never invokes `lp` again for that lease. If the worker
exits during this state, wait two minutes for its lease to expire, inspect
the computer queue and paper, then decide whether a retry is safe. The real
`/merchant` page shows each job, version, attempts, computer queue ID,
errors, and whether one-ticket retry is available. Staff must enter a reason
and confirm they checked the paper. The underlying bearer-protected worker
retry endpoint remains for operations, but its token is never sent to the
browser. One failed destination never blocks the other. A cancelled order
is not claimable; an already claimed ticket cannot be recalled.

## Portable container deployment

The production artifact is a standard Node.js 22 container listening on `PORT`, with no Railway imports in the application code. The same image can run on Azure Container Apps/App Service or AWS App Runner/ECS/Fargate. Each platform still needs:

- a reachable PostgreSQL service (`Azure Database for PostgreSQL`, `Amazon RDS for PostgreSQL`, or another provider);
- the same runtime environment variables and secrets;
- an HTTPS public origin assigned to `APP_BASE_URL`;
- a Stripe webhook targeting `/api/stripe/webhook`;
- a release job or deployment step that runs `node scripts/migrate.mjs` before new application instances receive traffic.

Platform networking, IAM, secret stores, TLS certificates, health-check configuration, and database backup policies are infrastructure settings and are intentionally kept outside the order/payment domain code.

## Stripe Sandbox configuration

The webhook endpoint is `/api/stripe/webhook`. Subscribe only to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `refund.created`
- `refund.updated`
- `refund.failed`

Useful Stripe test cards:

- Successful payment: `4242 4242 4242 4242`
- 3DS authentication: `4000 0025 0000 3155`
- Insufficient funds: `4000 0000 0000 9995`

Use any future expiry and any three-digit CVC. Do not enter real card details in Sandbox.

## Verification

```bash
bun run typecheck
bun run test
bun run lint
bun run build
bun run db:check
```

The test script deliberately invokes Vitest through Node while Bun remains the package manager. This avoids differences between Bun's test runtime and the Vite/Vitest runtime used by the application.

## Main routes

- `/order` or `/order?table=<signed-token>` — menu and pickup or dine-in cart
- `/checkout` — server quote, pending order, and Stripe Embedded Checkout
- `/order-confirmation?session_id=...` — webhook-aware payment confirmation
- `/track-order?t=...` — private database-backed tracking
- `/admin` — demo KDS
- `/merchant` — token-protected board for real orders, status updates, counter payments and print jobs
- `/admin/menu` — PostgreSQL menu management (add/delete/photo upload requires `ADMIN_ACCESS_TOKEN`)
- `/admin/integrations` — mock integration states
- `/api/health` — deployment liveness check
- `/api/menu-images/:imageId` — cacheable public delivery for uploaded dish photos

## Architecture boundaries

- `src/api/ordering.ts` is the browser-safe Server Function facade.
- `src/server/**` contains pricing, availability, order, payment, and tracking services.
- `src/db/**`, `drizzle/**`, and `scripts/migrate.mjs` contain the schema, seed, and generated migrations.
- `src/integrations/payments/**` contains Stripe-specific code.
- `src/integrations/pos/**` and `src/integrations/printing/**` are provider adapters.
- `src/domain/**` contains provider-neutral contracts.

Browser totals are estimates only. The server reloads canonical menu prices, validates modifiers, promotions, pickup capacity, amount, currency, and payment state before fulfilling an order.

Admin dish photos are resized in the browser and capped at 700 KB before server-side signature
validation. The compressed image is stored in PostgreSQL, so Railway deployments do not require a
persistent volume and the same application remains portable to Azure or AWS. For a substantially
larger multi-venue catalogue, replace this repository boundary with S3-compatible object storage.
