// src/app/privacy/page.tsx
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

export default function PrivacyPage() {
  return (
    <div className="wmi-container wmi-section max-w-3xl">
      <PageHeader
        kicker="Privacy Policy"
        title="Privacy policy"
        subtitle="This policy explains how information is collected, used, and shared on World's Most Interesting."
      />

      <div className="mt-8 space-y-6 text-sm text-slate-600">
        <section>
          <h2 className="text-lg font-bold text-slate-900">1. Information We Collect</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Name</li>
            <li>Email address</li>
            <li>Profile bio</li>
            <li>Photos and images</li>
            <li>Payment-related metadata</li>
            <li>Any other information you choose to provide</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">2. How We Use Your Information</h2>
          <p className="mt-2">We may use your information to:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Operate and display the site</li>
            <li>Feature you as a champion</li>
            <li>Process payments</li>
            <li>Market or promote the platform</li>
            <li>Share your submitted content (including name, bio, photos, and similar profile details) on social media and other platforms to promote the site</li>
            <li>Enforce our rules and moderate content</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">3. Sharing Data for Promotion</h2>
          <p className="mt-2">
            You acknowledge and agree that we may share your submitted profile content for promotional purposes,
            including reposting or featuring it on social media and partner channels related to World's Most
            Interesting.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">4. Profile Identity Limits</h2>
          <p className="mt-2">
            Each email address is limited to one active profile identity: one name, one bio, and one primary photo.
            You may submit content for yourself or another person, but abusive or misleading submissions may be removed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">5. Photos & Media</h2>
          <p className="mt-2">
            Photos uploaded to this platform may be reused, edited, shared, or redistributed without compensation.
            You should only upload content you have the legal right to share.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">6. Content Moderation & Safety</h2>
          <p className="mt-2">
            We may remove content that includes derogatory statements, inappropriate photos, bullying, harassment, or
            other harmful behavior. We may also suspend or ban accounts that violate these standards.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">7. Data Removal</h2>
          <p className="mt-2">
            You may request account deletion, but previously shared or published content may remain in
            circulation and cannot be fully retracted.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">8. Security</h2>
          <p className="mt-2">
            We take reasonable measures to protect your information, but no system is completely secure. Use the site
            at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900">9. Policy Changes</h2>
          <p className="mt-2">
            This policy may change at any time. Continued use of the site means you accept the current version.
          </p>
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

