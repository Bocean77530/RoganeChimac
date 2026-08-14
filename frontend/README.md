# Seoul Table pickup ordering demo

TanStack Start application demonstrating an Australian restaurant pickup flow with server-side pricing, PostgreSQL order persistence, Stripe Embedded Checkout, public order tracking, a demo kitchen display, and mock POS/printing adapters.

## Current scope

- Pickup only; delivery and pay-at-pickup are intentionally hidden.
- Stripe Sandbox card payments through Embedded Checkout.
- Standard PostgreSQL persistence with Drizzle migrations and seed data.
- Signed Stripe webhook as the only source of payment success.
- Private-token confirmation and tracking pages backed by the database.
- Demo `/admin` KDS with mock data, Mock POS, retry states, and 80mm browser printing.

The Admin/KDS is a presentation surface in this iteration. It is not authenticated and does not yet read production orders, so it must not be exposed as a production operations console. A real restaurant POS and automatic LAN printer also require a provider-specific adapter or an on-premise print bridge.

## Local setup

Requirements: Bun, Node.js 22 or later, PostgreSQL 15 or later, a Stripe Sandbox, and Stripe CLI for local webhook forwarding.

```bash
bun install --frozen-lockfile
cp .env.example .env.local
```

Fill `.env.local` with test credentials. Use a random `TRACKING_TOKEN_PEPPER` of at least 32 characters. Never commit `.env.local`, `sk_*`, or `whsec_*` values.

For a local PostgreSQL database, `DATABASE_URL` can look like:

```dotenv
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/seoul_table"
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
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
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
```

`VITE_STRIPE_PUBLISHABLE_KEY` is intentionally public and is passed to the Docker build as a declared build argument. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, and `TRACKING_TOKEN_PEPPER` remain runtime-only secrets. Do not enable Railway skipped builds when changing a `VITE_*` value because Vite embeds it in the browser bundle.

The database is reached over Railway's private network. Do not replace `Postgres.DATABASE_URL` with a public TCP URL unless an external administrative tool specifically needs it.

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
- `/admin/integrations` — mock integration states
- `/api/health` — deployment liveness check

## Architecture boundaries

- `src/api/ordering.ts` is the browser-safe Server Function facade.
- `src/server/**` contains pricing, availability, order, payment, and tracking services.
- `src/db/**`, `drizzle/**`, and `scripts/migrate.mjs` contain the schema, seed, and generated migrations.
- `src/integrations/payments/**` contains Stripe-specific code.
- `src/integrations/pos/**` and `src/integrations/printing/**` are provider adapters.
- `src/domain/**` contains provider-neutral contracts.

Browser totals are estimates only. The server reloads canonical menu prices, validates modifiers, promotions, pickup capacity, amount, currency, and payment state before fulfilling an order.
