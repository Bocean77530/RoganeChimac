# Seoul Table pickup ordering demo

TanStack Start application demonstrating an Australian restaurant pickup flow with server-side pricing, PostgreSQL order persistence, Stripe Embedded Checkout, public order tracking, a demo kitchen display, and mock POS/printing adapters.

## Current scope

- Pickup only; delivery and pay-at-pickup are intentionally hidden.
- Stripe Sandbox card payments through Embedded Checkout.
- PostgreSQL/Neon persistence with Drizzle migrations and seed data.
- Signed Stripe webhook as the only source of payment success.
- Private-token confirmation and tracking pages backed by the database.
- Demo `/admin` KDS with mock data, Mock POS, retry states, and 80mm browser printing.

The Admin/KDS is a presentation surface in this iteration. It is not authenticated and does not yet read production orders, so it must not be exposed as a production operations console. A real restaurant POS and automatic LAN printer also require a provider-specific adapter or an on-premise print bridge.

## Local setup

Requirements: Bun, Node.js 22 or later, a PostgreSQL/Neon test database, a Stripe Sandbox, and Stripe CLI for local webhook forwarding.

```bash
bun install --frozen-lockfile
cp .env.example .env.local
```

Fill `.env.local` with test credentials. Use a random `TRACKING_TOKEN_PEPPER` of at least 32 characters. Never commit `.env.local`, `sk_*`, or `whsec_*` values.

Create and seed the test database:

```bash
bun run db:migrate
bun run db:seed
```

Start the app:

```bash
bun run dev
```

In another terminal, forward Stripe Sandbox webhooks:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the CLI-provided `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the app. This local secret is different from a Dashboard webhook endpoint secret.

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

## Architecture boundaries

- `src/api/ordering.ts` is the browser-safe Server Function facade.
- `src/server/**` contains pricing, availability, order, payment, and tracking services.
- `src/db/**` and `drizzle/**` contain the schema, seed, and generated migrations.
- `src/integrations/payments/**` contains Stripe-specific code.
- `src/integrations/pos/**` and `src/integrations/printing/**` are provider adapters.
- `src/domain/**` contains provider-neutral contracts.

Browser totals are estimates only. The server reloads canonical menu prices, validates modifiers, promotions, pickup capacity, amount, currency, and payment state before fulfilling an order.
