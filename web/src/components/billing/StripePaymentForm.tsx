"use client";

import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { AlertCircle } from "lucide-react";
import { getStripe } from "../../lib/stripe";

interface StripePaymentFormProps {
  clientSecret: string;
  amountLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const TOAST_DURATION_MS = 8000;

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      className="alert alert-danger"
      role="alert"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        boxShadow: "var(--shadow-md)",
        maxWidth: "28rem",
        cursor: "pointer",
      }}
      onClick={onDismiss}
    >
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
      <span>{message}</span>
    </div>
  );
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

    try {
      // Validates and collects the selected payment method (card, Link,
      // etc.) before confirming - without this, an incomplete/invalid
      // field can fail silently instead of surfacing a validation error.
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Please check your payment details");
        return;
      }

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
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        onSuccess();
        return;
      }

      setError(`Payment status: ${paymentIntent?.status ?? "unknown"}`);
    } catch (err) {
      // Catches anything confirmPayment/submit throw rather than resolve
      // with an `error` field - without this, an unexpected rejection
      // left isSubmitting stuck `true` forever with no feedback at all,
      // which is exactly what looked like "the Pay button does nothing".
      setError(err instanceof Error ? err.message : "Something went wrong processing the payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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

        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
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
