// src/app/terms/page.tsx
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-[11px] font-semibold tracking-[0.25em] text-emerald-600">
        TERMS & CONDITIONS
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
        Terms & Conditions
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        Welcome to <strong>World’s Most Interesting</strong>. This website is a
        lighthearted, for-fun experience where users can compete to be featured
        as the “World’s Most Interesting Person” for a day — or longer, as long
        as they hold the crown.
      </p>

      <div className="mt-8 space-y-6 text-sm text-slate-600">
        {/* Eligibility */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">1. Eligibility</h2>
          <p className="mt-2">
            You must be <strong>18 years of age or older</strong> to create an
            account, submit content, or participate in any crown-related activity.
            By using this site, you confirm that you meet this requirement.
          </p>
        </section>

        {/* Just for fun */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">2. This Is Just for Fun</h2>
          <p className="mt-2">
            This platform is intended purely for entertainment. Being featured
            as the “World’s Most Interesting Person” carries <strong>no real-world
            status, benefit, or guarantee</strong>. There are no prizes, rewards,
            or promises beyond on-site visibility and bragging rights.
          </p>
        </section>

        {/* Crown & payments */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">
            3. Crown Purchases & Payments
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Users may place offers to hold the crown.</li>
            <li>The highest offer at the designated time wins the crown.</li>
            <li>
              <strong>All sales are final.</strong> Once your payment is processed
              and you are awarded the crown, <strong>no refunds</strong> will be issued.
            </li>
            <li>
              You may remove your payment method or adjust your crown price at any time,
              <strong>unless you have already been awarded the crown</strong>.
            </li>
            <li>
              Once the crown is awarded for a given day, that transaction is final,
              regardless of how long you hold the crown.
            </li>
          </ul>
        </section>

        {/* Content rules */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">4. Content Guidelines</h2>
          <p className="mt-2">
            To keep things fun and respectful, the following content is not allowed:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Vulgar, hateful, or explicit language</li>
            <li>Nudity or sexually explicit imagery</li>
            <li>Harassment, threats, or targeting of individuals or groups</li>
            <li>Illegal, deceptive, or misleading content</li>
          </ul>
          <p className="mt-2">
            We reserve the right to remove or replace any content at our sole
            discretion without refund.
          </p>
        </section>

        {/* Rights to content */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">5. Content Rights</h2>
          <p className="mt-2">
            By submitting your name, bio, photo, or any other information, you grant
            us a <strong>perpetual, irrevocable, royalty-free right</strong> to use,
            reproduce, modify, display, distribute, sell, and share that content
            for any purpose, including marketing and social media.
          </p>
          <p className="mt-2">
            This includes, but is not limited to, use on this website, promotional
            materials, emails, advertisements, and third-party platforms.
          </p>
        </section>

        {/* Termination */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">6. Account Termination</h2>
          <p className="mt-2">
            We reserve the right to suspend or terminate accounts at any time for
            violations of these terms or for behavior that undermines the spirit
            of the platform.
          </p>
        </section>

        {/* Liability */}
        <section>
          <h2 className="text-lg font-bold text-slate-900">7. Limitation of Liability</h2>
          <p className="mt-2">
            This service is provided “as is.” We are not responsible for lost data,
            missed opportunities, disappointment, or bruised egos.
          </p>
        </section>
      </div>

      <p className="mt-10 text-xs text-slate-400">
        Questions? <Link href="/contact" className="underline">Contact us</Link>
      </p>
    </div>
  );
}
