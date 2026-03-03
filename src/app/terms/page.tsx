// src/app/terms/page.tsx
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

export default function TermsPage() {
  return (
    <div className="wmi-container wmi-section max-w-3xl">
      <PageHeader
        kicker="Terms & Conditions"
        title="Terms & conditions"
        subtitle="Welcome to World's Most Interesting. This website is a for-fun experience where users compete to be featured for a day."
      />

      <div className="mt-8 space-y-6 text-sm text-slate-600">
        <section>
          <h2 className="text-lg font-bold text-slate-900">1. Eligibility</h2>
          <p className="mt-2">
            You must be <strong>18 years of age or older</strong> to create an account, submit content, or participate
            in any crown-related activity. By using this site, you confirm that you meet this requirement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">2. This Is Just for Fun</h2>
          <p className="mt-2">
            This platform is intended purely for entertainment. Being featured as the "World's Most Interesting Person"
            carries <strong>no real-world status, benefit, or guarantee</strong>. There are no prizes, rewards, or
            promises beyond on-site visibility and bragging rights.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">3. Crown Purchases & Payments</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Users may place offers to hold the crown.</li>
            <li>The highest offer at the designated time wins the crown.</li>
            <li><strong>All sales are final.</strong> Once payment is processed, no refunds are issued.</li>
            <li>You may remove your payment method or adjust your crown price at any time unless already crowned.</li>
            <li>Once the crown is awarded for a given day, that transaction is final.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">4. Content Guidelines</h2>
          <p className="mt-2">To keep things fun and respectful, the following content is not allowed:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Vulgar, hateful, or explicit language</li>
            <li>Nudity or sexually explicit imagery</li>
            <li>Harassment, threats, or targeting of individuals or groups</li>
            <li>Illegal, deceptive, or misleading content</li>
          </ul>
          <p className="mt-2">We reserve the right to remove or replace any content at our sole discretion without refund.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">5. Content Rights</h2>
          <p className="mt-2">
            By submitting your name, bio, photo, or any other information, you grant us a
            <strong> perpetual, irrevocable, royalty-free right</strong> to use, reproduce, modify, display,
            distribute, sell, and share that content for any purpose, including marketing and social media.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">6. Account Termination</h2>
          <p className="mt-2">
            We reserve the right to suspend or terminate accounts at any time for violations of these terms or for
            behavior that undermines the spirit of the platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">7. Limitation of Liability</h2>
          <p className="mt-2">This service is provided "as is." We are not responsible for lost data or missed opportunities.</p>
        </section>
      </div>

      <p className="mt-10 text-xs text-slate-400">
        Questions?{' '}
        <Link href="/contact" className="underline">
          Contact us
        </Link>
      </p>
    </div>
  );
}

