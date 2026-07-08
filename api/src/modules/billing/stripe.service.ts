import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * SECURITY: Stripe integration security model (cite in report)
 *
 * This integration follows PCI-DSS SAQ A compliance by design:
 *
 * 1. Card data never touches our server.
 *    Stripe.js (loaded client-side from Stripe's CDN) tokenises
 *    the card number directly in the browser. Our server only ever
 *    sees a PaymentIntent ID — never a card number, CVV, or expiry.
 *    (PCI-DSS Requirement 3: Protect stored cardholder data —
 *    we store nothing because we never receive it)
 *
 * 2. Webhook signature verification prevents fake confirmations.
 *    Without verification, an attacker could POST a fake
 *    'payment_intent.succeeded' event to our webhook endpoint
 *    and mark invoices as paid without paying. Stripe signs every
 *    webhook with HMAC-SHA256 using our webhook secret.
 *    constructEvent() verifies this signature before we act.
 *    (OWASP A08: Software and Data Integrity Failures)
 *
 * 3. Secret key stays server-side only.
 *    The Stripe Secret Key (sk_test_...) is only used in this
 *    service, loaded from environment variables, never logged
 *    or returned in API responses. The Publishable Key
 *    (pk_test_...) is the only Stripe key exposed to the browser.
 *    (OWASP A02: Cryptographic Failures — key management)
 *
 * 4. Idempotency keys prevent double-charging.
 *    Each PaymentIntent is tied to a specific invoiceId. If the
 *    same invoice is submitted twice (network retry, double-click),
 *    Stripe returns the existing PaymentIntent rather than creating
 *    a new one — preventing duplicate charges.
 */

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      // Pinned to the version this installed `stripe` SDK release
      // (22.3.0) itself expects — must be updated together with the
      // package version. Explicit pinning (rather than omitting this
      // option and taking the SDK's current default) means a future
      // `npm install stripe@latest` cannot silently change API
      // behaviour for this integration without a deliberate version
      // bump here too.
      apiVersion: '2026-06-24.dahlia',
      // Telemetry disabled — do not send usage data to Stripe
      telemetry: false,
    });
  }

  /**
   * Creates a PaymentIntent for a given invoice amount.
   *
   * The PaymentIntent represents the intent to collect payment.
   * It returns a clientSecret which the frontend uses to render
   * Stripe's payment form. The clientSecret is safe to expose
   * to the browser — it can only be used to confirm this specific
   * payment, not to create new charges.
   *
   * @param invoiceId - Used as idempotency key to prevent
   *   duplicate PaymentIntents for the same invoice
   * @param amountInCents - Stripe uses integer cents (paise for
   *   NPR, cents for USD) — never floating point
   * @param currency - ISO 4217 currency code
   */
  async createPaymentIntent(
    invoiceId: string,
    amountInCents: number,
    currency: string = 'usd',
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency,
        // Store invoiceId in metadata so webhooks can identify
        // which invoice to mark as paid
        metadata: {
          invoiceId,
          system: 'restaurant-secure',
        },
        // Automatic payment methods — lets Stripe show the best
        // payment methods for the customer's location
        automatic_payment_methods: {
          enabled: true,
        },
      },
      {
        // Idempotency key: same invoiceId always returns the same
        // PaymentIntent. Prevents double-charging on retries.
        idempotencyKey: `invoice-${invoiceId}`,
      },
    );

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe did not return a client secret');
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Verifies a Stripe webhook signature and returns the event.
   *
   * SECURITY: This is the most critical security check in the
   * payment flow. Without it, anyone could POST a fake
   * 'payment_intent.succeeded' event to mark invoices as paid.
   *
   * The signature is verified using HMAC-SHA256 with the webhook
   * signing secret (whsec_...) which is only known to us and Stripe.
   * constructEvent() also validates the timestamp to prevent replay
   * attacks (events older than 300 seconds are rejected).
   *
   * @param payload - Raw request body as Buffer (MUST be raw bytes,
   *   not parsed JSON — parsing before verification breaks the
   *   signature check)
   * @param signature - Value of the Stripe-Signature header
   */
  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook signature verification failed: ${message}`);
      // Re-throw — the controller will return 400 to Stripe
      // Stripe will retry webhooks that return non-2xx responses
      throw err;
    }
  }

  /**
   * Converts a Decimal amount (e.g. 135.54) to Stripe's integer
   * cents format (13554). Stripe requires integer amounts to avoid
   * floating-point precision issues in financial calculations.
   */
  toStripeCents(amount: number | string): number {
    return Math.round(Number(amount) * 100);
  }
}
