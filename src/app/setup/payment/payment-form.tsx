'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { auth } from '@/lib/firebaseClient';

type Props = {
  customerId: string;
};

export default function PaymentForm({ customerId }: Props) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [busyDeactivate, setBusyDeactivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getIdTokenOrThrow() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in.');
    return await user.getIdToken();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError('Stripe is still loading. Please try again in a moment.');
      return;
    }

    try {
      setSubmitting(true);

      // 1) Confirm SetupIntent
      const result = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to confirm payment method.');
      }

      const setupIntent = result.setupIntent;
      if (!setupIntent) {
        throw new Error('No SetupIntent returned by Stripe.');
      }

      const paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;

      if (!paymentMethodId) {
        throw new Error('Stripe did not return a payment method ID.');
      }

      // 2) Save payment method on server
      const token = await getIdTokenOrThrow();

      const res = await fetch('/api/payment/set-default-payment-method', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paymentMethodId,
          customerId,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save payment method.');
      }

      // ✅ SUCCESS → go to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Payment setup error:', err);
      setError(err?.message || 'Payment setup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate() {
    setError(null);

    try {
      setBusyDeactivate(true);

      const token = await getIdTokenOrThrow();

      const res = await fetch('/api/payment/deactivate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        throw new Error(data.error || 'Failed to deactivate account.');
      }

      // Optional: stay on page or redirect if you want
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Deactivate error:', err);
      setError(err?.message || 'Failed to deactivate account.');
    } finally {
      setBusyDeactivate(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PaymentElement />

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="w-full rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Update Card'}
        </button>
      </form>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-[11px] text-slate-600">
          We don&apos;t store your full card details. Stripe securely manages your payment method.
        </p>

        <button
          type="button"
          onClick={handleDeactivate}
          disabled={busyDeactivate}
          className="mt-3 w-full rounded-full border border-slate-300 bg-white px-5 py-2 text-[11px] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
        >
          {busyDeactivate ? 'Deactivating…' : 'Remove card & deactivate account'}
        </button>
      </div>
    </div>
  );
}
