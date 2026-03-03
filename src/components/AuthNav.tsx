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
      router.push('/'); // ✅ redirect to home
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  // Prevent flashing wrong nav while auth state is resolving
  if (!ready) {
    return <div className="h-5 w-40" />;
  }

  if (user) {
    return (
      <nav className="flex gap-4 text-sm">
        <Link href="/dashboard" className="text-slate-600 underline-offset-4 transition-opacity hover:opacity-75">
          Dashboard
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="text-slate-500 underline-offset-4 transition-opacity hover:opacity-75"
        >
          Log out
        </button>
      </nav>
    );
  }

  return (
    <nav className="flex gap-4 text-sm">
      <Link href="/signup" className="text-slate-600 underline-offset-4 transition-opacity hover:opacity-75">
        Become the One
      </Link>
      <Link href="/login" className="text-slate-500 underline-offset-4 transition-opacity hover:opacity-75">
        Login
      </Link>
    </nav>
  );
}
