// src/components/become/CrownPriceTest.tsx
'use client';

import { useState } from 'react';

interface SetupIntentResponse {
  clientSecret?: string;
  customerId?: string;
  error?: string;
  details?: string;
}

export default function CrownPriceTest() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SetupIntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/payment/create-setup-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // using a dummy email for now — later we'll use the real user email
        body: JSON.stringify({ email: 'test@worldsmostinteresting.com' }),
      });

      const data = (await res.json()) as SetupIntentResponse;

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setResponse(data);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
      <p className="mb-2 font-semibold text-slate-200">
        Stripe Connection Test
      </p>
      <p className="mb-3 text-[11px] text-slate-400">
        This button just checks that we can talk to Stripe and create a SetupIntent.
        No real charges are made.
      </p>

      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
      >
        {loading ? 'Contacting Stripe…' : 'Test Stripe SetupIntent'}
      </button>

      {error && (
        <p className="mt-3 text-[11px] text-red-400">
          Error: {error}
        </p>
      )}

      {response && (
        <div className="mt-3 space-y-1 break-all text-[11px]">
          <p>
            <span className="font-semibold text-slate-200">Customer ID:</span>{' '}
            {response.customerId}
          </p>
          <p>
            <span className="font-semibold text-slate-200">Client Secret:</span>{' '}
            {response.clientSecret}
          </p>
        </div>
      )}
    </div>
  );
}
