// src/app/signup/page.tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { db, auth } from '@/lib/firebaseClient';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';

// ✅ Best practice: version your legal docs so you can require re-acceptance later if needed.
const TERMS_VERSION = '2026-01-07';
const PRIVACY_VERSION = '2026-01-07';

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

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

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please fill out your name, email, and password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!isAdult) {
      setError('You must confirm that you are at least 18 years old.');
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      setError('You must agree to the Terms & Conditions and Privacy Policy.');
      return;
    }

    setLoading(true);

    try {
      let userCred;

      // ✅ Common acceptance fields (stored at time of signup/login)
      const acceptanceFields = {
        isAdult: true,
        acceptTerms: true,
        acceptPrivacy: true,

        // best-practice audit trail
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAcceptedAt: serverTimestamp(),
        privacyAcceptedAt: serverTimestamp(),
      };

      try {
        // Try to create a NEW user
        userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        // Set display name
        if (auth.currentUser && fullName.trim()) {
          await updateProfile(auth.currentUser, {
            displayName: fullName.trim(),
          });
        }

        // Create / merge base user doc
        await setDoc(
          doc(db, 'users', user.uid),
          {
            fullName: fullName.trim(),
            email: user.email,
            ...acceptanceFields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err: any) {
        // If email is already in use: treat this as a LOGIN instead of blocking
        if (err?.code === 'auth/email-already-in-use') {
          userCred = await signInWithEmailAndPassword(auth, email, password);
          const user = userCred.user;

          // Update basic info in Firestore (merge, don't overwrite everything)
          // ✅ Also store acceptance + timestamps (because they explicitly agreed on this screen)
          await setDoc(
            doc(db, 'users', user.uid),
            {
              fullName: fullName.trim(),
              email: user.email ?? email.trim(),
              ...acceptanceFields,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          // Any other auth error → show a friendly message
          if (err?.code === 'auth/invalid-email') {
            setError('Please enter a valid email address.');
          } else if (err?.code === 'auth/weak-password') {
            setError('Password is too weak. Please choose a stronger one.');
          } else {
            setError(err?.message || 'Something went wrong during sign up.');
          }
          setLoading(false);
          return;
        }
      }

      const user =
        (auth.currentUser ??
          (userCred && 'user' in userCred ? userCred.user : null)) as User | null;

      if (!user) {
        throw new Error('Unable to determine current user after signup/login.');
      }

      // Optionally store minimal info locally
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('wmi_uid', user.uid);
        window.localStorage.setItem('wmi_email', user.email ?? email);
        window.localStorage.setItem('wmi_fullName', fullName.trim());
      }

      // Decide where they should go next
      await redirectBasedOnProfile(user);
    } catch (err: any) {
      console.error('Error during signup/login:', err);
      if (!error) {
        setError(err?.message || 'Something went wrong during sign up.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Create your account
      </h1>

      <p className="mt-3 text-sm text-slate-600">
        Start by creating an account. You&apos;ll set your Crown Price and add your
        card on the next steps. You won&apos;t be charged unless you&apos;re crowned.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-800 shadow-sm"
      >
        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Full Name
          </label>
          <input
            type="text"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="How should we display you?"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Email
          </label>
          <input
            type="email"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="we@need.to.reach.you"
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
            placeholder="Create a password for your account"
          />
          <p className="text-[10px] text-slate-500">
            You&apos;ll use this to log in later and change your Crown Price, card, or profile.
          </p>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={isAdult}
            onChange={(e) => setIsAdult(e.target.checked)}
            className="h-3 w-3 rounded border-slate-400 bg-white"
          />
          I confirm that I am at least 18 years old.
        </label>

        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-[2px] h-3 w-3 rounded border-slate-400 bg-white"
          />
          <span>
            I agree to the{' '}
            <a
              href="/terms"
              className="underline text-emerald-600 hover:text-emerald-500"
              target="_blank"
              rel="noreferrer"
            >
              Terms &amp; Conditions
            </a>
            .
          </span>
        </label>

        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={acceptPrivacy}
            onChange={(e) => setAcceptPrivacy(e.target.checked)}
            className="mt-[2px] h-3 w-3 rounded border-slate-400 bg-white"
          />
          <span>
            I agree to the{' '}
            <a
              href="/privacy"
              className="underline text-emerald-600 hover:text-emerald-500"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>

        {error && <p className="text-[11px] text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-emerald-500 px-5 py-2 text-[11px] font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? 'Creating your account…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
