'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebaseClient';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import PageHeader from '@/components/PageHeader';

function getResetErrorMessage(code?: string) {
  switch (code) {
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'This reset link is invalid or has expired. Request a new one.';
    case 'auth/weak-password':
      return 'Choose a stronger password.';
    default:
      return 'Could not reset your password right now.';
  }
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifying, setVerifying] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function verifyCode() {
      if (!oobCode) {
        setError('This reset link is missing required information.');
        setVerifying(false);
        return;
      }

      try {
        const resolvedEmail = await verifyPasswordResetCode(auth, oobCode);
        if (!active) return;
        setEmail(resolvedEmail);
      } catch (err: any) {
        if (!active) return;
        setError(getResetErrorMessage(err?.code));
      } finally {
        if (active) setVerifying(false);
      }
    }

    verifyCode();
    return () => {
      active = false;
    };
  }, [oobCode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!password.trim()) {
      setError('Enter a new password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setNotice('Your password has been reset. You can log in now.');
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err: any) {
      setError(getResetErrorMessage(err?.code));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wmi-container wmi-section max-w-xl">
      <PageHeader
        kicker="Access"
        title="Reset your password"
        subtitle="Choose a new password to get back into your World's Most Interesting account."
      />

      <form
        onSubmit={handleSubmit}
        className="wmi-card mt-6 space-y-4 rounded-2xl p-6 text-xs text-slate-800"
      >
        {verifying ? (
          <p className="text-sm text-slate-600">Checking your reset link...</p>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
              Resetting password for <span className="font-semibold text-slate-900">{email || 'your account'}</span>
            </div>

            <div className="grid gap-2">
              <label className="text-[11px] font-semibold text-slate-800">
                New password
              </label>
              <input
                type="password"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a new password"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-[11px] font-semibold text-slate-800">
                Confirm password
              </label>
              <input
                type="password"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
              />
            </div>
          </>
        )}

        {error && <p className="text-[11px] text-red-500">{error}</p>}
        {notice && <p className="text-[11px] text-emerald-700">{notice}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={verifying || saving || Boolean(error && !email)}
            className="rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save new password'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="rounded-full border border-slate-200 bg-white px-5 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to login
          </button>
        </div>
      </form>
    </div>
  );
}
