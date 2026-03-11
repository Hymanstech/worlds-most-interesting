// src/app/login/page.tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { auth, db } from '@/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, User } from 'firebase/auth';
import PageHeader from '@/components/PageHeader';

function getLoginErrorMessage(code?: string) {
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with that email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Password invalid. Retry it, or reset your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many login attempts. Wait a bit, then try again or reset your password.';
    default:
      return 'Unable to log in right now.';
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function redirectBasedOnProfile(user: User) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    const data = snap.exists() ? (snap.data() as any) : {};

    const hasProfile =
      typeof data.crownPrice === 'number' &&
      !!data.bio &&
      !!data.photoUrl;

    const hasPayment = !!data.defaultPaymentMethodId;
    const needsPayment = typeof data.crownPrice === 'number' && data.crownPrice > 0;

    if (!hasProfile) {
      router.push('/setup/profile');
    } else if (needsPayment && !hasPayment) {
      router.push('/setup/payment');
    } else {
      router.push('/dashboard');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('wmi_uid', user.uid);
        window.localStorage.setItem('wmi_email', user.email ?? email);
      }

      await redirectBasedOnProfile(user);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(getLoginErrorMessage(err?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Enter your email first, then use reset password.');
      return;
    }

    setResetting(true);

    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Could not send reset email right now.');
      }

      setNotice('Password reset email sent. Check your inbox and spam folder.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err?.message === 'Could not send reset email right now.') {
        setError(err.message);
      } else if (err?.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Could not send reset email right now. Please try again.');
      }
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="wmi-container wmi-section max-w-xl">
      <PageHeader
        kicker="Access"
        title="Log in"
        subtitle="Log in to access your dashboard, or pick up where you left off in signup."
      />

      <form
        onSubmit={handleSubmit}
        className="wmi-card mt-5 space-y-4 rounded-2xl p-4 text-xs text-slate-800 sm:mt-6 sm:p-6"
      >
        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Email
          </label>
          <input
            type="email"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Password
          </label>
          <input
            type="password"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
          <div>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetting}
              className="text-[10px] font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-600 disabled:opacity-60"
            >
              {resetting ? 'Sending reset email...' : 'Forgot password? Reset it'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-[11px] text-red-500">
            {error}
          </p>
        )}

        {notice && (
          <p className="text-[11px] text-emerald-700">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? 'Logging you in' : 'Log in'}
        </button>

        <p className="mt-3 text-[10px] text-slate-500">
          Don&apos;t have an account?{' '}
          <a
            href="/signup"
            className="underline text-emerald-600 hover:text-emerald-500"
          >
            Create one here.
          </a>
        </p>
      </form>
    </div>
  );
}


