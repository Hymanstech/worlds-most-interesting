// src/components/become/CrownPriceForm.tsx
'use client';

import { FormEvent, useState } from 'react';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripeClient';

type SetupIntentResponse = {
  clientSecret?: string;
  customerId?: string;
  error?: string;
  details?: string;
};

function PaymentStep({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: window.location.origin + '/become?status=success',
      },
    });

    if (result.error) {
      setError(
        result.error.message || 'Something went wrong while saving your card.'
      );
    } else {
      setStatusMessage('Card saved successfully! You are ready for the crown.');
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
      <PaymentElement />
      {error && (
        <p className="mt-2 text-[11px] text-red-400">
          {error}
        </p>
      )}
      {statusMessage && (
        <p className="mt-2 text-[11px] text-emerald-400">
          {statusMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !stripe || !elements}
        className="mt-3 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
      >
        {loading ? 'Saving your card…' : 'Save card & finish'}
      </button>
    </form>
  );
}

export default function CrownPriceForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [crownPrice, setCrownPrice] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [step, setStep] = useState<'profile' | 'payment'>('profile');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !crownPrice.trim()) {
      setError('Please fill out your name, email, and Crown Price.');
      return;
    }

    if (!isAdult) {
      setError('You must confirm that you are at least 18 years old.');
      return;
    }

    if (!password || password.length < 8) {
      setError('Please choose a password with at least 8 characters.');
      return;
    }

    if (!acceptTerms) {
      setError('You must agree to the Terms & Conditions to continue.');
      return;
    }

    const crownPriceNumber = Number(crownPrice);
    if (Number.isNaN(crownPriceNumber) || crownPriceNumber <= 0) {
      setError('Please enter a valid Crown Price greater than 0.');
      return;
    }

    setLoading(true);

    try {
      // For now we only send email to Stripe.
      // Later we’ll also send fullName, crownPrice, and password to our own backend user DB.
      const res = await fetch('/api/payment/create-setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as SetupIntentResponse;

      if (!res.ok || !data.clientSecret || !data.customerId) {
        throw new Error(data.error || 'Failed to start payment setup.');
      }

      setClientSecret(data.clientSecret);
      setCustomerId(data.customerId);
      setStep('payment');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong contacting Stripe.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 text-xs text-slate-200">
      {step === 'profile' && (
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid gap-2">
            <label className="text-[11px] font-semibold text-slate-300">
              Full Name
            </label>
            <input
              type="text"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="How should we display you?"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold text-slate-300">
              Email
            </label>
            <input
              type="email"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="we@need.to.reach.you"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold text-slate-300">
              Crown Price (USD per day)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              value={crownPrice}
              onChange={(e) => setCrownPrice(e.target.value)}
              placeholder="How much is the crown worth to you?"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold text-slate-300">
              Password
            </label>
            <input
              type="password"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password for your account"
            />
            <p className="text-[10px] text-slate-500">
              You&apos;ll use this to log in later and update your Crown Price, card, or profile.
            </p>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={isAdult}
              onChange={(e) => setIsAdult(e.target.checked)}
              className="h-3 w-3 rounded border-slate-700 bg-slate-900"
            />
            I confirm that I am at least 18 years old.
          </label>

          <label className="flex items-start gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-[2px] h-3 w-3 rounded border-slate-700 bg-slate-900"
            />
            <span>
              I agree to the{' '}
              <a
                href="/terms"
                className="underline text-emerald-400 hover:text-emerald-300"
                target="_blank"
              >
                Terms &amp; Conditions
              </a>
              .
            </span>
          </label>

          {error && (
            <p className="text-[11px] text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? 'Starting payment setup…' : 'Continue to card details'}
          </button>
        </form>
      )}

      {step === 'payment' && clientSecret && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] text-slate-400">
            Almost done. Add your card to complete your Crown Price setup.
          </p>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'night' },
            }}
          >
            <PaymentStep clientSecret={clientSecret} />
          </Elements>
        </div>
      )}

      {customerId && (
        <p className="mt-3 text-[10px] text-slate-500">
          (Stripe customer ID: {customerId})
        </p>
      )}
    </div>
  );
}
