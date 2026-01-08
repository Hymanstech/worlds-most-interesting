// src/app/privacy/page.tsx
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-[11px] font-semibold tracking-[0.25em] text-emerald-600">
        PRIVACY POLICY
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
        Privacy Policy
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        This Privacy Policy explains how information is collected, used, and shared
        on World’s Most Interesting.
      </p>

      <div className="mt-8 space-y-6 text-sm text-slate-600">
        {/* What we collect */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            1. Information We Collect
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Name</li>
            <li>Email address</li>
            <li>Profile bio</li>
            <li>Photos and images</li>
            <li>Payment-related metadata</li>
            <li>Any other information you choose to provide</li>
          </ul>
        </section>

        {/* How used */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            2. How We Use Your Information
          </h2>
          <p className="mt-2">
            We may use your information to:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Operate and display the site</li>
            <li>Feature you as a champion</li>
            <li>Process payments</li>
            <li>Market or promote the platform</li>
            <li>Share content on social media or other platforms</li>
            <li>Sell or distribute data to third parties</li>
          </ul>
        </section>

        {/* Sharing */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            3. Sharing & Selling Data
          </h2>
          <p className="mt-2">
            You acknowledge and agree that we may share, license, or sell any
            information you provide — including your name, email, bio, photos,
            and other content — to third parties for any purpose.
          </p>
        </section>

        {/* Photos */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            4. Photos & Media
          </h2>
          <p className="mt-2">
            Photos uploaded to this platform may be reused, edited, shared, or
            redistributed without compensation. You should only upload content
            you have the legal right to share.
          </p>
        </section>

        {/* Data removal */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            5. Data Removal
          </h2>
          <p className="mt-2">
            You may request account deletion, but previously shared, sold, or
            published content may remain in circulation and cannot be fully
            retracted.
          </p>
        </section>

        {/* Security */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            6. Security
          </h2>
          <p className="mt-2">
            We take reasonable measures to protect your information, but no system
            is completely secure. Use the site at your own risk.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            7. Policy Changes
          </h2>
          <p className="mt-2">
            This policy may change at any time. Continued use of the site means
            you accept the current version.
          </p>
        </section>
      </div>

      <p className="mt-10 text-xs text-slate-400">
        Questions? <Link href="/contact" className="underline">Contact us</Link>
      </p>
    </div>
  );
}
