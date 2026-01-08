// src/app/login/page.tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { auth, db } from '@/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, User } from 'firebase/auth';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function redirectBasedOnProfile(user: User) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    const data = snap.exists() ? (snap.data() as any) : {};

    const hasProfile =
      typeof data.crownPrice === 'number' &&
      !!data.bio &&
      !!data.photoUrl;

    const hasPayment = !!data.defaultPaymentMethodId;

    if (!hasProfile) {
      router.push('/setup/profile');
    } else if (!hasPayment) {
      router.push('/setup/payment');
    } else {
      router.push('/dashboard');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

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
      if (err?.code === 'auth/user-not-found') {
        setError('No account found with that email.');
      } else if (err?.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else {
        setError(err?.message || 'Unable to log in right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Log in
      </h1>

      <p className="mt-3 text-sm text-slate-600">
        Log in to access your dashboard — or pick up where you left off in the signup process.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-800 shadow-sm"
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
        </div>

        {error && (
          <p className="text-[11px] text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? 'Logging you in…' : 'Log in'}
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
