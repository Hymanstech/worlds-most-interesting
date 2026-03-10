'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
  User,
} from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';

export default function AuthNav() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Keep user logged in until tab/browser is closed
    setPersistence(auth, browserSessionPersistence).catch(() => {});

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });

    return () => unsub();
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.push('/'); //  redirect to home
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  // Prevent flashing wrong nav while auth state is resolving
  if (!ready) {
    return <div className="h-10 w-44 sm:h-5 sm:w-40" />;
  }

  if (user) {
    return (
      <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:gap-5">
        <Link href="/dashboard" className="transition-opacity hover:opacity-70">
          Dashboard
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="text-slate-500 transition-opacity hover:opacity-70"
        >
          Log out
        </button>
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:gap-5">
      <Link
        href="/signup"
        className="rounded-full border border-slate-300/80 px-3 py-2 text-center text-[10px] tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50 sm:border-0 sm:px-0 sm:py-0 sm:text-[11px] sm:tracking-[0.08em]"
      >
        Become the One
      </Link>
      <Link href="/login" className="text-slate-500 transition-opacity hover:opacity-70">
        Login
      </Link>
    </nav>
  );
}

