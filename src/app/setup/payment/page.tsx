// src/app/setup/payment/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Elements } from '@stripe/react-stripe-js';
import { StripeElementsOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripeClient';

import PaymentForm from './payment-form';
import { auth } from '@/lib/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';

export default function PaymentSetupPage() {
  const router = useRouter();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ensure we wait for Firebase Auth to resolve the current user
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        setError(null);
        setLoading(true);

        if (!user) {
          router.push('/login');
          return;
        }

        const res = await fetch('/api/payment/create-setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            email: user.email ?? undefined,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as any;

        if (!res.ok) {
          throw new Error(
            data.error || data.details || 'Failed to start payment authorization.'
          );
        }

        if (!data.clientSecret || !data.customerId) {
          throw new Error('Server did not return clientSecret/customerId.');
        }

        setClientSecret(data.clientSecret);
        setCustomerId(data.customerId);
      } catch (err: any) {
        console.error('Error starting payment setup:', err);
        setError(err?.message || 'Failed to start payment authorization.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const options: StripeElementsOptions | undefined = clientSecret
    ? { clientSecret }
    : undefined;

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Payment Authorization
        </h1>
        <p className="mt-3 text-sm text-slate-600">Preparing secure checkout…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Payment Authorization
        </h1>
        <p className="mt-3 text-sm text-red-500">{error}</p>

        <button
          onClick={() => router.push('/dashboard')}
          className="mt-6 rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!clientSecret || !customerId || !options) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Payment Authorization
        </h1>
        <p className="mt-3 text-sm text-red-500">
          Missing Stripe setup information. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Payment Authorization
      </h1>

      <p className="mt-3 text-sm text-slate-600">
        Add a card to activate your account. You will only be charged if you win the crown.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-800 shadow-sm">
        <Elements stripe={stripePromise} options={options}>
          <PaymentForm customerId={customerId} />
        </Elements>
      </div>
    </div>
  );
}
