// src/app/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import PageHeader from '@/components/PageHeader';

type CrownStatus = {
  // Public snapshot fields stored in /crownStatus/current
  currentChampionName?: string;
  currentChampionBio?: string;
  currentChampionPhotoUrl?: string;

  // Optional featured media hooks
  featuredImageUrl?: string;
  featuredVideoUrl?: string;

  updatedAt?: any; // Firestore Timestamp
};

export default function HomePage() {
  const [status, setStatus] = useState<CrownStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        setLoading(true);

        const ref = doc(db, 'crownStatus', 'current');
        const snap = await getDoc(ref);

        if (!mounted) return;

        if (snap.exists()) setStatus(snap.data() as CrownStatus);
        else setStatus(null);
      } catch (e: any) {
        console.error('Homepage load error:', e);
        if (!mounted) return;
        setError(e?.message || 'Failed to load today\'s champion.');
        setStatus(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const championName = status?.currentChampionName?.trim() || 'No champion yet';
  const championBio =
    status?.currentChampionBio?.trim() ||
    'No one is wearing the crown right now. Check back soon-or claim the spot by setting up your profile.';
  const championPhoto = status?.currentChampionPhotoUrl?.trim() || '';

  const featuredImageUrl = status?.featuredImageUrl?.trim() || '';
  const featuredVideoUrl = status?.featuredVideoUrl?.trim() || '';

  const heroIsVideo = Boolean(featuredVideoUrl);
  const heroImage = featuredImageUrl || championPhoto;

  return (
    <div className="wmi-container wmi-section">
      <PageHeader
        kicker="Daily Crown"
        title="Today's Most Interesting Person"
        subtitle="The title is claimed each midnight by Crown Price, then held in full view for one day."
        rightSlot={(
          <Link
            href="/how-it-works"
            className="hidden text-xs font-semibold text-slate-500 underline-offset-4 transition-opacity hover:opacity-75 sm:inline-block"
          >
            How it works {'->'}
          </Link>
        )}
      />

      <p className="mb-8 mt-[-20px] text-[11px] font-medium tracking-[0.02em] text-slate-500">
        Charged via Stripe &bull; Winner selected nightly &bull; Featured for 24 hours
      </p>

      <section className="wmi-card overflow-hidden rounded-[2rem] border-slate-200/70">
        <div className="border-b border-slate-200/80 p-7 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">CURRENT M.I.P</p>

              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {championName}
              </h2>

              {loading && <p className="mt-2 text-[11px] text-slate-400">Loading today's champion...</p>}

              {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
            </div>

            <span className="shrink-0 rounded-full border border-slate-300/70 bg-slate-100/50 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Wearing The Crown
            </span>
          </div>
        </div>

        <div className="p-7 sm:p-9">
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white">
            <div className="aspect-[16/9] w-full bg-white">
              {heroIsVideo ? (
                <video src={featuredVideoUrl} controls className="h-full w-full object-contain bg-white" />
              ) : heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImage} alt={`${championName} featured`} className="h-full w-full object-contain bg-white" />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-500">
                  No photo yet. The next champion will appear here.
                </div>
              )}
            </div>
          </div>

          <p className="mt-7 text-base leading-relaxed text-slate-700">{championBio}</p>

          {(featuredVideoUrl || featuredImageUrl) && championPhoto && (
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500">CHAMPION SPOTLIGHT</p>
              <p className="mt-2 text-xs text-slate-600">
                Today's spotlight media is set separately from the profile photo.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/80 bg-white p-7 sm:p-9">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-slate-600">
              Think you're more interesting? Here's how to claim the crown.
            </p>

            <Link
              href="/how-it-works"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-[11px] font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              Learn the rules {'->'}
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-10 text-center text-[11px] text-slate-400">The crown changes daily.</div>
    </div>
  );
}


