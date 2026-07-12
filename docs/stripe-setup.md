# Stripe Local Testing

How to test the Stripe payment integration end-to-end on a local dev machine, using Stripe's test mode (no real money ever moves).

## Prerequisites

- A free Stripe account (test mode) - https://dashboard.stripe.com/register
- The [Stripe CLI](https://docs.stripe.com/stripe-cli) installed (`stripe` on PATH)

## 1. Get your test-mode API keys

From the Stripe Dashboard (test mode toggle on), **Developers -> API keys**:

- **Publishable key** (`pk_test_...`) - safe to expose to the browser
- **Secret key** (`sk_test_...`) - server-side only, never commit this

Add them to the env files (never commit these values):

```
# api/.env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # see step 2 - this comes from `stripe listen`, not the dashboard, for local dev

# web/.env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 2. Forward webhooks to your local API

Stripe's servers cannot reach `localhost` directly, so the CLI forwards events to your machine over an authenticated tunnel:

```bash
stripe login
stripe listen --forward-to localhost:4000/billing/webhooks/stripe
```

This prints a webhook signing secret specific to this `listen` session:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx (^C to quit)
```

Copy that into `api/.env` as `STRIPE_WEBHOOK_SECRET` and restart the API. **This secret changes every time you run `stripe listen`** - update `.env` and restart the API each session, or the webhook signature check will fail for every event (correctly - this is the security control working as intended, not a bug).

Leave `stripe listen` running in its own terminal for the rest of testing - it prints every event it forwards and the HTTP status our API returned for it, which is the fastest way to see whether a webhook was accepted (200) or rejected (400).

## 3. Run the app

```bash
# terminal 1
cd api && npm run start:dev

# terminal 2
cd web && npm run dev

# terminal 3 (already running from step 2)
stripe listen --forward-to localhost:4000/billing/webhooks/stripe
```

## 4. Test card numbers

Stripe's test mode accepts any *future* expiry date, any 3-digit CVC, and any postal code. Only the card number itself changes behaviour:

| Number | Result |
| --- | --- |
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 0002` | Card declined (generic) |
| `4000 0000 0000 9995` | Declined - insufficient funds |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |

Full list: https://docs.stripe.com/testing#cards

## 5. Manual test flow

1. Log in as a Cashier, create an invoice for a billable order.
2. Click **Pay with Stripe** on the invoice row.
3. Enter `4242 4242 4242 4242`, any future expiry, any CVC, submit.
4. Watch the `stripe listen` terminal - it should show `payment_intent.succeeded` forwarded with a `200` response from our API.
5. Refresh the invoice list - status should now be `PAID`, payment method `STRIPE`.

To see a declined payment, repeat with `4000 0000 0000 0002` - the form shows the decline message and the invoice stays `UNPAID` (no webhook event marks it paid, since Stripe never sends `payment_intent.succeeded` for a declined attempt).

## 6. Testing webhook signature verification (forged request)

To confirm the endpoint actually rejects unsigned/forged events rather than trusting any POST body, send one directly, bypassing Stripe entirely:

```bash
curl -i -X POST http://localhost:4000/billing/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1,v1=forged" \
  -d '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_fake","metadata":{"invoiceId":"any-id"}}}}'
```

Expected: `400 Bad Request`, body message about signature verification failing, and the target invoice's status is unchanged. This is the control that stops an attacker marking arbitrary invoices as paid by POSTing a fake event directly to the endpoint.

## 7. Manually triggering an event (optional)

The CLI can also fire a synthetic event without going through the checkout UI at all:

```bash
stripe trigger payment_intent.succeeded
```

Note this creates a PaymentIntent with no `invoiceId` in its metadata, so `handlePaymentSucceeded` logs a warning ("unknown PaymentIntent") and does nothing further - useful for confirming that code path doesn't crash on an unrecognised PaymentIntent, but not a substitute for the real flow in step 5 when testing invoice settlement itself.
