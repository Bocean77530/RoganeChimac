# Rogane Chimac pickup ordering demo

TanStack Start application demonstrating an Australian restaurant pickup flow with server-side pricing, PostgreSQL order persistence, Stripe Embedded Checkout, public order tracking, a demo kitchen display, and mock POS/printing adapters.

## Current scope

- The public checkout is pickup only; delivery and pay-at-pickup are hidden. The phase-one dine-in service is disabled by default.
- Stripe Sandbox card payments through Embedded Checkout.
- Standard PostgreSQL persistence with Drizzle migrations and seed data.
- Signed Stripe webhook as the only source of payment success.
- Private-token confirmation and tracking pages backed by the database.
- Database-backed public menu with protected add/delete operations in `/admin/menu`.
- Demo `/admin` KDS with mock data, Mock POS, retry states, and 80mm browser printing.
- Real paid-order board at `/merchant`, protected by `ADMIN_ACCESS_TOKEN`; merchant changes appear on the customer's tracking page.
- Two local printer jobs per newly paid order, claimed over HTTPS by the shop Mac. The worker saves kitchen and front PDFs before sending each job to `lp`.

The `/admin` KDS remains a presentation surface with mock orders. Use `/merchant` for actual paid orders. The printer bridge runs on the shop Mac, where it can reach the Brother printer. The POS adapter remains a mock.

## Dine-in phase one (service foundation only)

Migration `0003_futuristic_khan.sql` adds `restaurant_tables` and nullable table/slot fields without deleting pickup, payment or integration-job data. New restaurants and existing rows have `dine_in_enabled = false` by default. Keep it disabled outside a controlled test until the QR entry and v2 ticket renderer are completed.

The server accepts `fulfillment: { type: "dine_in", mode: "table", tableCode }` with `paymentMethod: "pay_at_counter"`. A table code is an HMAC-signed token bound to restaurant ID, table ID and `token_version`; the server checks the signature, restaurant, active flag and current version at both quote and order submission. Rotate a table QR by incrementing `token_version`, or deactivate its row. Provisioning/admin QR issuance is not yet a public endpoint; trusted server code can call `signTableCode` in `src/server/table-codes.server.ts` after reading the current table row. Set a separate `DINE_IN_TABLE_CODE_SECRET` of at least 32 characters before a local test.

A pay-at-counter table order is stored as `submitted` / `unpaid` without reserving pickup capacity. The order transaction inserts exactly two `local_worker` jobs, one kitchen and one front, with frozen schema-v2 table, item, note, total and unpaid payment details. The current worker API serves only schema-v1 pickup jobs; these v2 jobs remain queued until the phase-three ticket adapter is complete. Dine-in online payment is rejected in this phase. Merchant acceptance does not create more print jobs. The customer QR journey, counter payment recording and dine-in ticket rendering remain later work.

The optional database integration test **resets its target database** and runs only when `TEST_DATABASE_URL` names a local database exactly `dine_in_phase1_test`. It applies migrations 0000–0002, seeds existing pickup/payment/print-job rows, applies 0003, then checks data retention, table-code validation, dine-in idempotency/jobs and the pickup payment event path:

```bash
TEST_DATABASE_URL=postgresql://USER@127.0.0.1:5432/dine_in_phase1_test npm test -- src/server/__tests__/dine-in.integration.test.ts
```

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
```

`VITE_STRIPE_PUBLISHABLE_KEY` is intentionally public and is passed to the Docker build as a declared build argument. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, and `TRACKING_TOKEN_PEPPER` remain runtime-only secrets. Do not enable Railway skipped builds when changing a `VITE_*` value because Vite embeds it in the browser bundle.

The database is reached over Railway's private network. Do not replace `Postgres.DATABASE_URL` with a public TCP URL unless an external administrative tool specifically needs it.

The printer integration uses the existing PostgreSQL `integration_jobs` table, so it adds no schema migration and does not rewrite existing orders. Jobs are created only when a new payment success event is confirmed; historical paid orders are not automatically backfilled or printed.

## Shop printer and order progress

Open `/merchant` on the main Railway URL and enter the existing `ADMIN_ACCESS_TOKEN`. The page lists real paid pickup orders and lets staff advance them through accepted, preparing, ready for pickup, and collected. The customer's private `/track-order` page refreshes every five seconds.

On the shop Mac, copy `printing/main-worker.env.example` to `data/main-worker.env` and set the same `PRINT_WORKER_TOKEN` as Railway. Set `KITCHEN_PRINTER` and `FRONT_PRINTER` to the exact local queue names; both may point to the Brother queue. Keep this file private. Run:

```bash
npm run print:main
```

Keep the terminal running while orders are accepted. The worker polls every three seconds, creates private PDFs under `data/receipts-main/`, and sends the ticket text to the local print queues. `npm run print:main -- --dry-run --once` previews pending jobs without claiming them. `npm run print:main -- --once` processes current pending jobs and exits. A successful queue report means the operating system accepted the job; check the physical printer for paper and print quality.

If the printer command times out and its outcome is unknown, the job stays in `processing` to avoid an automatic duplicate. After checking the printer and confirming no ticket printed, an operator can manually retry the job through the bearer-protected `POST /api/local-print-jobs/:jobId/retry` endpoint with a JSON `reason` of at least eight characters. The two destinations are independent, so one failed queue does not block the other.

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

- `/order` — menu and pickup cart
- `/checkout` — server quote, pending order, and Stripe Embedded Checkout
- `/order-confirmation?session_id=...` — webhook-aware payment confirmation
- `/track-order?t=...` — private database-backed tracking
- `/admin` — demo KDS
- `/merchant` — token-protected board for real paid orders and status updates
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
