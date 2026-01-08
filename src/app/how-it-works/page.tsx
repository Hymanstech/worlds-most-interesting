// src/app/how-it-works/page.tsx
import Link from 'next/link';

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10">
        <p className="text-[11px] font-semibold tracking-[0.25em] text-emerald-600">
          HOW IT WORKS
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          The Daily Crown 👑
        </h1>

        <p className="mt-4 text-base leading-relaxed text-slate-600">
          This whole thing is just for fun. It’s a silly little internet game where
          someone gets to be <span className="font-semibold text-slate-800">The World’s Most Interesting Person</span>{' '}
          for a day (or longer)… as long as they hold the crown.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">What you’re buying</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You’re not buying fame. You’re not buying status in real life. You’re not
            buying anything with real-world value.
            <span className="font-semibold text-slate-800"> You’re buying the crown spot on this website</span>{' '}
            — the front-and-center feature on the homepage.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">How the crown works</h2>
          <ol className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <span className="font-semibold text-slate-800">1)</span> People place offers to hold the crown.
            </li>
            <li>
              <span className="font-semibold text-slate-800">2)</span> Each day, the <span className="font-semibold text-slate-800">highest offer wins</span>.
            </li>
            <li>
              <span className="font-semibold text-slate-800">3)</span> The winner becomes the homepage champion until someone outbids them on a future day.
            </li>
          </ol>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Important:</span> This is just a fun leaderboard-style crown.
              No guarantees, no real-world benefits — just bragging rights and a good laugh.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Make it interesting</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            If you win, your photo and bio get featured. Keep it playful, weird, charming,
            and (most importantly) not mean. The goal is to make people smile when they visit.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-white">Want a shot at the crown?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Create your profile so you’re ready when you decide to make a run for it.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Sign up →
            </Link>

            <Link
              href="/"
              className="rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-white/5"
            >
              Back to today&apos;s champion
            </Link>
          </div>

          <p className="mt-4 text-[11px] text-slate-400">
            By signing up you agree to keep things respectful and fun.
          </p>
        </section>
      </div>
    </div>
  );
}
