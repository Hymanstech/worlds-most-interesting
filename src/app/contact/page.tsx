import PageHeader from '@/components/PageHeader';

export default function ContactPage() {
  return (
    <div className="wmi-container wmi-section max-w-3xl">
      <PageHeader
        kicker="Contact"
        title="Contact"
        subtitle="For support or press inquiries, email support@worldsmostinteresting.com."
      />

      <div className="wmi-card mt-6 max-w-xl rounded-2xl p-6">
        <p className="text-sm text-slate-700">
          support@worldsmostinteresting.com
        </p>
      </div>
    </div>
  );
}

