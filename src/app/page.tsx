// src/app/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
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
        setError(e?.message || 'Failed to load today’s champion.');
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
    'No one is wearing the crown right now. Check back soon—or claim the spot by setting up your profile.';
  const championPhoto = status?.currentChampionPhotoUrl?.trim() || '';

  const featuredImageUrl = status?.featuredImageUrl?.trim() || '';
  const featuredVideoUrl = status?.featuredVideoUrl?.trim() || '';

  const heroIsVideo = Boolean(featuredVideoUrl);
  const heroImage = featuredImageUrl || championPhoto;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Top page intro */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.25em] text-emerald-600">
          DAILY CROWN
        </p>

        <div className="mt-3 flex items-end justify-between gap-4">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Today&apos;s Most Interesting Person
          </h1>

          <Link
            href="/how-it-works"
            className="hidden text-xs font-semibold text-slate-500 hover:text-slate-800 sm:inline-block"
          >
            How it works →
          </Link>
        </div>

        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          One person. One day. Their face and story, front and center.
        </p>

        <div className="mt-3 sm:hidden">
          <Link
            href="/how-it-works"
            className="text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            How it works →
          </Link>
        </div>
      </div>

      {/* Champion FIRST and full-width */}
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="border-b border-slate-200 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">
                CURRENT M.I.P
              </p>

              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {championName}
              </h2>

              {loading && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Loading today&apos;s champion…
                </p>
              )}

              {error && (
                <p className="mt-2 text-[11px] text-red-600">{error}</p>
              )}
            </div>

            <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
              👑 Wearing the crown
            </span>
          </div>
        </div>

        {/* Hero media */}
        <div className="p-6 sm:p-8">
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <div className="aspect-[16/9] w-full bg-white">
              {heroIsVideo ? (
                <video
                  src={featuredVideoUrl}
                  controls
                  className="h-full w-full object-contain bg-white"
                />
              ) : heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt={`${championName} featured`}
                  className="h-full w-full object-contain bg-white"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-500">
                  No photo yet. The next champion will appear here.
                </div>
              )}
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-slate-700">
            {championBio}
          </p>

          {(featuredVideoUrl || featuredImageUrl) && championPhoto && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500">
                CHAMPION SPOTLIGHT
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Today&apos;s spotlight media is set separately from the profile photo.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-slate-600">
              Think you&apos;re more interesting? Here&apos;s how to claim the crown.
            </p>

            <Link
              href="/how-it-works"
              className="rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              Learn the rules →
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-10 text-center text-[11px] text-slate-400">
        The crown changes daily.
      </div>
    </div>
  );
}
