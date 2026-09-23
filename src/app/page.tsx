// src/app/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

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
    setError(null);
    setLoading(true);

    const ref = doc(db, 'crownStatus', 'current');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setStatus(snap.exists() ? (snap.data() as CrownStatus) : null);
        setLoading(false);
      },
      (e: any) => {
        console.error('Homepage load error:', e);
        setError(e?.message || 'Failed to load today\'s champion.');
        setStatus(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
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
    <div className="wmi-container py-5 sm:py-8">
      <section aria-labelledby="featured-person" className="wmi-card overflow-hidden border-slate-200/70">
        <header className="px-5 pb-2 pt-5 sm:px-8 sm:pt-7">
          <h1 id="featured-person" className="text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
            {loading ? "Today's featured person" : championName}
          </h1>
          {loading && <p role="status" className="mt-2 text-sm text-slate-500">Loading today&apos;s champion...</p>}
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </header>

        <div className="p-3 sm:px-8 sm:pb-8 sm:pt-4">
            <div className="overflow-hidden rounded-[1.35rem] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.10),rgba(15,23,42,0.02)_45%,rgba(255,255,255,1)_100%)] p-3 sm:rounded-[1.5rem] sm:p-5">
              <div className="mx-auto flex min-h-[260px] max-w-[920px] items-center justify-center sm:min-h-[520px]">
                {heroIsVideo ? (
                  <video src={featuredVideoUrl} controls className="h-full max-h-[520px] w-auto max-w-full rounded-[1.25rem] object-contain shadow-[0_20px_50px_rgba(15,23,42,0.18)]" />
                ) : heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroImage}
                    alt={`${championName} featured`}
                    className="h-[360px] w-auto max-w-full rounded-[1.25rem] object-contain shadow-[0_20px_50px_rgba(15,23,42,0.18)] sm:h-[520px]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    No photo yet. The next champion will appear here.
                  </div>
                )}
              </div>
            </div>

          <div className="mx-auto mt-4 max-w-4xl sm:mt-6">
            <p className="text-[1.05rem] leading-8 text-slate-700 sm:text-[1.45rem] sm:leading-10">
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

      <section aria-labelledby="daily-crown" className="px-2 pb-4 pt-8 sm:px-8 sm:pt-10">
        <p className="wmi-kicker">Daily Crown</p>
        <h2 id="daily-crown" className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Today&apos;s Most Interesting Person
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          One homepage spot, a new opportunity every night. The highest eligible offer with a successful payment wins the next daily crown.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
          <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1.5">Winner selected nightly</span>
          <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1.5">Your photo and bio featured</span>
        </div>
      </section>
    </div>
  );
}


