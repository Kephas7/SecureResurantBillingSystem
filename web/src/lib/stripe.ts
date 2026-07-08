import { loadStripe, Stripe } from "@stripe/stripe-js";

// SECURITY: only the Publishable Key (pk_test_/pk_live_) is ever used
// here - it is safe to expose in browser-shipped code by design (it can
// only create tokens/PaymentIntents client-side, never move money or
// read account data). The Secret Key never leaves the API server (see
// api/src/modules/billing/stripe.service.ts).
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// loadStripe() fetches Stripe.js from https://js.stripe.com - Stripe
// requires this to be loaded directly from their CDN (not bundled/
// self-hosted) so that Stripe can ship security patches to the
// tokenisation logic without every integrator re-deploying. Cached as a
// singleton promise so repeated calls to getStripe() do not re-inject
// the script tag.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!publishableKey) {
      // eslint-disable-next-line no-console
      console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set - Stripe payments will not work.");
    }
    stripePromise = loadStripe(publishableKey ?? "");
  }
  return stripePromise;
}
