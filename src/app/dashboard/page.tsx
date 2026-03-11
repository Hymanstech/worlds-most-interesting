'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { auth, db } from '@/lib/firebaseClient';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import PageHeader from '@/components/PageHeader';

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

  const [highestActiveCrownPrice, setHighestActiveCrownPrice] = useState<number>(0);

  // Queue / tier info
  const [tierPosition, setTierPosition] = useState<number | null>(null);
  const [tierSize, setTierSize] = useState<number | null>(null);

  useEffect(() => {
    let unsubscribeQueue: (() => void) | null = null;

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

        // Make sure this user has a queueEntry doc before subscribing.
        await syncQueueEntryForCurrentUser();

        const activeQueue = query(
          collection(db, 'queueEntries'),
          where('isActive', '==', true)
        );

        unsubscribeQueue = onSnapshot(
          activeQueue,
          (queueSnap) => {
            const activeEntries: QueueEntry[] = queueSnap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            }));

            const highestBid = activeEntries.reduce((max, entry) => {
              const price = typeof entry.crownPrice === 'number' ? entry.crownPrice : 0;
              return price > max ? price : max;
            }, 0);
            setHighestActiveCrownPrice(highestBid);

            const currentUserEntry = activeEntries.find((entry) => entry.id === user.uid);
            const currentUserPrice =
              typeof currentUserEntry?.crownPrice === 'number'
                ? currentUserEntry.crownPrice
                : 0;

            if (currentUserPrice > 0) {
              const tier = activeEntries
                .filter((entry) => entry.crownPrice === currentUserPrice)
                .sort((a, b) => {
                  const ta = a.priceJoinedAt?.toMillis?.() ?? 0;
                  const tb = b.priceJoinedAt?.toMillis?.() ?? 0;
                  return ta - tb;
                });

              const idx = tier.findIndex((entry) => entry.id === user.uid);
              setTierPosition(idx >= 0 ? idx + 1 : null);
              setTierSize(tier.length);
            } else {
              setTierPosition(null);
              setTierSize(null);
            }
          },
          (queueError) => {
            console.error('Error subscribing to active queue:', queueError);
          }
        );

        setLoading(false);
      } catch (err: any) {
        console.error('Error loading dashboard:', err);
        setError(err?.message || 'Failed to load your dashboard.');
        setLoading(false);
      }
    }

    loadData();

    return () => {
      if (unsubscribeQueue) unsubscribeQueue();
    };
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
    const hasPayment = Boolean(userProfile?.stripeCustomerId && userProfile?.defaultPaymentMethodId);

    setUpdatingPrice(true);

    try {
      const patch: any = {
        crownPrice: parsed,
        isActive: parsed > 0 && hasPayment,
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

      //  Sync queueEntries (server writes)
      await syncQueueEntryForCurrentUser();

      if (parsed > 0 && !hasPayment) {
        router.push('/setup/payment');
        return;
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
      setHighestActiveCrownPrice(0);
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
      <div className="wmi-container wmi-section max-w-3xl">
        <PageHeader kicker="Dashboard" title="Your crown dashboard" />
        <p className="mt-3 text-sm text-slate-600">Loading your profile</p>
      </div>
    );
  }

  if (error && !userProfile) {
    return (
      <div className="wmi-container wmi-section max-w-3xl">
        <PageHeader kicker="Dashboard" title="Your crown dashboard" />
        <p className="mt-3 text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const hasPayment = Boolean(userProfile?.stripeCustomerId && userProfile.defaultPaymentMethodId);

  const yourPrice = userProfile?.crownPrice ?? 0;
  const nextPriceToTakeCrown = highestActiveCrownPrice > 0 ? highestActiveCrownPrice + 1 : 1;

  const showQueueInfo = yourPrice > 0 && userProfile?.isActive;

  return (
    <div className="wmi-container wmi-section max-w-3xl space-y-8">
      <PageHeader
        kicker="Dashboard"
        title="Your crown dashboard"
        subtitle="Manage your price, payment status, and queue position."
      />

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
          <p className="text-sm font-semibold text-slate-900">
            {userProfile?.fullName || 'Your Crown Dashboard'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {userProfile?.email || 'You are logged in and ready to compete for the crown.'}
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
            {updatingPrice ? 'Updating' : 'Update Crown Price'}
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
              You are <span className="font-semibold text-slate-900">#{tierPosition ?? ''}</span> in line at{' '}
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
            {yourPrice === 0 ? (
              <span className="font-semibold text-slate-700">Profile only</span>
            ) : userProfile?.isActive && hasPayment ? (
              <span className="font-semibold text-emerald-600">Active</span>
            ) : (
              <span className="font-semibold text-amber-600">Needs card</span>
            )}
          </p>
          {hasPayment ? (
            <p className="text-[10px] text-slate-500">
              We don&apos;t store your full card details. Stripe securely manages your payment method.
            </p>
          ) : yourPrice === 0 ? (
            <p className="text-[10px] text-slate-500">
              You can keep a profile at $0 and add a card later when you&apos;re ready to compete for the crown.
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
            {removingCard ? 'Removing card' : 'Remove card & deactivate account'}
          </button>
        )}

        {error && userProfile && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
      </section>
    </div>
  );
}



