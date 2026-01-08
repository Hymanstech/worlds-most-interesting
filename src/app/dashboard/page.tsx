'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { auth, db } from '@/lib/firebaseClient';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';

type UserProfile = {
  fullName?: string;
  email?: string;
  crownPrice?: number;
  priceJoinedAt?: any; // Firestore Timestamp
  bio?: string;
  photoUrl?: string;

  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  isActive?: boolean;
};

type QueueEntry = {
  id: string; // uid
  crownPrice?: number;
  priceJoinedAt?: any;
  isActive?: boolean;
};

async function syncQueueEntryForCurrentUser() {
  const user = auth.currentUser;
  if (!user) return;

  const token = await user.getIdToken();
  await fetch('/api/queue/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {
    // non-fatal
  });
}

export default function DashboardPage() {
  const router = useRouter();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priceInput, setPriceInput] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);

  const [currentHighestCrownPrice, setCurrentHighestCrownPrice] = useState<number | null>(null);

  // Queue / tier info
  const [tierPosition, setTierPosition] = useState<number | null>(null);
  const [tierSize, setTierSize] = useState<number | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setError(null);
        setLoading(true);

        const user = auth.currentUser;
        if (!user) {
          router.push('/signup');
          return;
        }

        // 1) Load user profile
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          setError('Could not find your profile. Please complete signup again.');
          setLoading(false);
          return;
        }

        const data = snap.data() as UserProfile;
        setUserProfile(data);

        setPriceInput(typeof data.crownPrice === 'number' ? String(data.crownPrice) : '0');

        // 2) Load crownStatus/current
        const statusRef = doc(db, 'crownStatus', 'current');
        const statusSnap = await getDoc(statusRef);
        if (statusSnap.exists()) {
          const statusData = statusSnap.data() as { currentHighestCrownPrice?: number };
          setCurrentHighestCrownPrice(
            typeof statusData.currentHighestCrownPrice === 'number'
              ? statusData.currentHighestCrownPrice
              : null
          );
        } else {
          setCurrentHighestCrownPrice(null);
        }

        // ✅ Make sure this user has a queueEntry doc (safe)
        await syncQueueEntryForCurrentUser();

        // 3) Queue position within your price tier (PUBLIC queueEntries)
        if (typeof data.crownPrice === 'number' && data.crownPrice > 0) {
          const qTier = query(
            collection(db, 'queueEntries'),
            where('isActive', '==', true),
            where('crownPrice', '==', data.crownPrice)
          );

          const tierSnap = await getDocs(qTier);
          const tier: QueueEntry[] = tierSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));

          // Sort FIFO by priceJoinedAt ascending
          tier.sort((a, b) => {
            const ta = a.priceJoinedAt?.toMillis?.() ?? 0;
            const tb = b.priceJoinedAt?.toMillis?.() ?? 0;
            return ta - tb;
          });

          const idx = tier.findIndex((u) => u.id === user.uid);
          setTierPosition(idx >= 0 ? idx + 1 : null);
          setTierSize(tier.length);
        } else {
          setTierPosition(null);
          setTierSize(null);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Error loading dashboard:', err);
        setError(err?.message || 'Failed to load your dashboard.');
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  async function handleUpdatePrice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      router.push('/signup');
      return;
    }

    const parsed = Number(priceInput);
    if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      setError('Crown Price must be a whole dollar amount (0 or higher).');
      return;
    }

    const prevPrice = userProfile?.crownPrice ?? 0;

    setUpdatingPrice(true);

    try {
      const patch: any = {
        crownPrice: parsed,
        updatedAt: serverTimestamp(),
      };

      // Only reset your position when you change tiers
      if (parsed !== prevPrice) {
        patch.priceJoinedAt = serverTimestamp();
      }

      await updateDoc(doc(db, 'users', user.uid), patch);

      // Update local state
      setUserProfile((prev) =>
        prev
          ? {
              ...prev,
              crownPrice: parsed,
              ...(parsed !== prevPrice ? { priceJoinedAt: new Date() as any } : {}),
            }
          : prev
      );

      // ✅ Sync queueEntries (server writes)
      await syncQueueEntryForCurrentUser();

      // Refresh queue display from queueEntries
      if (parsed > 0) {
        const qTier = query(
          collection(db, 'queueEntries'),
          where('isActive', '==', true),
          where('crownPrice', '==', parsed)
        );

        const tierSnap = await getDocs(qTier);
        const tier: QueueEntry[] = tierSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        tier.sort((a, b) => {
          const ta = a.priceJoinedAt?.toMillis?.() ?? 0;
          const tb = b.priceJoinedAt?.toMillis?.() ?? 0;
          return ta - tb;
        });

        const idx = tier.findIndex((u) => u.id === user.uid);
        setTierPosition(idx >= 0 ? idx + 1 : null);
        setTierSize(tier.length);
      } else {
        setTierPosition(null);
        setTierSize(null);
      }
    } catch (err: any) {
      console.error('Error updating crown price:', err);
      setError(err?.message || 'Failed to update your Crown Price.');
    } finally {
      setUpdatingPrice(false);
    }
  }

  async function handleRemoveCard() {
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      router.push('/signup');
      return;
    }

    const confirmed = window.confirm(
      'Removing your card will deactivate your account and set your Crown Price to 0. Continue?'
    );
    if (!confirmed) return;

    setRemovingCard(true);

    try {
      // IMPORTANT: This must be a server route that updates Firestore/Stripe via Admin SDK
      const idToken = await user.getIdToken();

      const res = await fetch('/api/payment/deactivate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate account.');

      // Sync queueEntries after deactivation
      await syncQueueEntryForCurrentUser();

      // Update local UI state immediately
      setUserProfile((prev) =>
        prev
          ? {
              ...prev,
              defaultPaymentMethodId: undefined,
              isActive: false,
              crownPrice: 0,
            }
          : prev
      );
      setPriceInput('0');
      setTierPosition(null);
      setTierSize(null);
    } catch (err: any) {
      console.error('Error removing card:', err);
      setError(err?.message || 'Failed to remove your card.');
    } finally {
      setRemovingCard(false);
    }
  }

  if (loading && !userProfile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Your Crown Dashboard</h1>
        <p className="mt-3 text-sm text-slate-600">Loading your profile…</p>
      </div>
    );
  }

  if (error && !userProfile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Your Crown Dashboard</h1>
        <p className="mt-3 text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const hasPayment = Boolean(userProfile?.stripeCustomerId && userProfile.defaultPaymentMethodId);

  const yourPrice = userProfile?.crownPrice ?? 0;
  const baseForNextPrice = currentHighestCrownPrice !== null ? currentHighestCrownPrice : yourPrice;
  const nextPriceToTakeCrown = baseForNextPrice + 1;

  const showQueueInfo = yourPrice > 0 && userProfile?.isActive;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <header className="flex items-center gap-4">
        {userProfile?.photoUrl ? (
          <img
            src={userProfile.photoUrl}
            alt={userProfile.fullName || 'Profile'}
            className="h-16 w-16 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400">
            No photo
          </div>
        )}

        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {userProfile?.fullName || 'Your Crown Dashboard'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {userProfile?.email ||
              'You are logged in and ready to become the World’s Most Interesting Person.'}
          </p>
        </div>
      </header>

      {/* Crown Profile / Price */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Your Daily Crown Price</h2>
            <p className="mt-1 text-xs text-slate-500">
              This is the amount you&apos;re willing to pay for a full day as the World&apos;s Most
              Interesting Person.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/profile/edit')}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
          >
            Edit Profile
          </button>
        </div>

        <form onSubmit={handleUpdatePrice} className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">$</span>
            <input
              type="number"
              min="0"
              step="1"
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={updatingPrice}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
          >
            {updatingPrice ? 'Updating…' : 'Update Crown Price'}
          </button>
        </form>

        <div className="text-xs text-slate-700 space-y-1">
          <p>
            <strong>Your current price:</strong>{' '}
            <span className="font-semibold text-emerald-600">${yourPrice.toFixed(0)}</span>
          </p>

          <p>
            <strong>Today&apos;s price to take the crown:</strong>{' '}
            <span className="font-semibold text-slate-900">${nextPriceToTakeCrown.toFixed(0)}</span>
          </p>

          {showQueueInfo && (
            <p className="text-[11px] text-slate-600">
              You are <span className="font-semibold text-slate-900">#{tierPosition ?? '—'}</span> in line at{' '}
              <span className="font-semibold text-slate-900">${yourPrice.toFixed(0)}</span>
              {typeof tierSize === 'number' ? (
                <>
                  {' '}
                  (out of <span className="font-semibold">{tierSize}</span>).
                </>
              ) : (
                '.'
              )}
            </p>
          )}

          <p className="text-[10px] text-slate-500">
            You can choose any whole dollar amount. If multiple people choose the same price, the queue is first-come, first-served for that price.
          </p>
        </div>
      </section>

      {/* Payment / Status */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Payment Method & Account Status</h2>
            <p className="mt-1 text-xs text-slate-500">
              You must have a valid card on file for your account to be active. Your card is only charged if you win the crown for the day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/setup/payment')}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-400"
          >
            {hasPayment ? 'Update Card' : 'Add Card'}
          </button>
        </div>

        <div className="text-xs text-slate-700 space-y-1">
          <p>
            <strong>Account status:</strong>{' '}
            {userProfile?.isActive && hasPayment ? (
              <span className="font-semibold text-emerald-600">Active</span>
            ) : (
              <span className="font-semibold text-amber-600">Inactive</span>
            )}
          </p>
          {hasPayment ? (
            <p className="text-[10px] text-slate-500">
              We don&apos;t store your full card details. Stripe securely manages your payment method.
            </p>
          ) : (
            <p className="text-[10px] text-slate-500">
              Add a card to activate your account and be eligible to take the crown.
            </p>
          )}
        </div>

        {hasPayment && (
          <button
            type="button"
            disabled={removingCard}
            onClick={handleRemoveCard}
            className="mt-2 rounded-full border border-red-300 bg-red-50 px-4 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {removingCard ? 'Removing card…' : 'Remove card & deactivate account'}
          </button>
        )}

        {error && userProfile && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
      </section>
    </div>
  );
}
