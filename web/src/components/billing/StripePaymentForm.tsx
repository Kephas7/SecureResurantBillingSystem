"use client";

import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { AlertCircle } from "lucide-react";
import { getStripe } from "../../lib/stripe";

interface StripePaymentFormProps {
  clientSecret: string;
  amountLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// SECURITY: card details are entered directly into Stripe's own
// PaymentElement, an iframe hosted by js.stripe.com - our code never
// sees, handles, or has DOM access to the raw card number/CVV/expiry
// (PCI-DSS SAQ A). stripe.confirmPayment() sends the card data straight
// from that iframe to Stripe; we only ever receive the PaymentIntent's
// status back.
function CheckoutForm({ amountLabel, onSuccess, onCancel }: Omit<StripePaymentFormProps, "clientSecret">): JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setError(null);

    // redirect: 'if_required' keeps the cashier on this page for
    // payment methods (cards) that don't need an off-site redirect -
    // the invoice is only ever marked PAID by the webhook, so this
    // client-side result is used purely to drive the UI, not as the
    // source of truth for payment success.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setIsSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onSuccess();
      return;
    }

    setError(`Payment status: ${paymentIntent?.status ?? "unknown"}`);
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "contents" }}>
      <div className="panel-body">
        <PaymentElement />

        {/* Dev-only hint - Stripe test cards never charge real money */}
        {process.env.NODE_ENV !== "production" && (
          <p className="text-muted text-sm" style={{ marginTop: "0.75rem" }}>
            Test cards: <code>4242 4242 4242 4242</code> (succeeds), <code>4000 0000 0000 0002</code> (declined).
            Any future expiry, any CVC, any postcode.
          </p>
        )}

        {error && (
          <div className="alert alert-danger" style={{ marginTop: "0.75rem" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="panel-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!stripe || isSubmitting}>
          {isSubmitting ? "Processing..." : `Pay ${amountLabel}`}
        </button>
      </div>
    </form>
  );
}

export function StripePaymentForm({ clientSecret, amountLabel, onSuccess, onCancel }: StripePaymentFormProps): JSX.Element {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      <CheckoutForm amountLabel={amountLabel} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
