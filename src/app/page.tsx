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
            className="inline-flex items-center rounded-full border border-slate-300/80 bg-white/70 px-4 py-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-white"
          >
            How it works {'->'}
          </Link>
        )}
      />

      <div className="mb-8 mt-[-8px] flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.03em] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1.5">Winner selected nightly</span>
        <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1.5">Featured for 24 hours</span>
      </div>

      <section className="wmi-card overflow-hidden border-slate-200/70">
        <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] p-6 sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.24em] text-slate-400">CURRENT M.I.P</p>

              <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                {championName}
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
                One person holds the crown in full public view until the next nightly selection.
              </p>

              {loading && <p className="mt-3 text-[11px] text-slate-400">Loading today&apos;s champion...</p>}

              {error && <p className="mt-3 text-[11px] text-red-600">{error}</p>}
            </div>

            <span className="inline-flex shrink-0 self-start rounded-full border border-slate-300/80 bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm">
              Wearing The Crown
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="rounded-[1.75rem] border border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-4 sm:p-6">
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.10),rgba(15,23,42,0.02)_45%,rgba(255,255,255,1)_100%)] px-4 py-5 sm:px-6 sm:py-7">
              <div className="mx-auto flex min-h-[360px] max-w-[680px] items-center justify-center sm:min-h-[520px]">
                {heroIsVideo ? (
                  <video src={featuredVideoUrl} controls className="h-full max-h-[520px] w-auto max-w-full rounded-[1.25rem] object-contain shadow-[0_20px_50px_rgba(15,23,42,0.18)]" />
                ) : heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroImage}
                    alt={`${championName} featured`}
                    className="h-full max-h-[520px] w-auto max-w-full rounded-[1.25rem] object-contain shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    No photo yet. The next champion will appear here.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-4xl">
            <p className="text-lg leading-9 text-slate-700 sm:text-[1.45rem] sm:leading-10">
              {championBio}
            </p>
          </div>

          {(featuredVideoUrl || featuredImageUrl) && championPhoto && (
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500">CHAMPION SPOTLIGHT</p>
              <p className="mt-2 text-xs text-slate-600">
                Today's spotlight media is set separately from the profile photo.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="max-w-xl text-sm leading-relaxed text-slate-600">
              Think you&apos;re more interesting? Set your profile, name your Crown Price, and make the next nightly result about you.
            </p>

            <Link
              href="/how-it-works"
              className="rounded-full border border-slate-300 bg-slate-900 px-5 py-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800"
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


