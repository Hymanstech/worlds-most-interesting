import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="wmi-container wmi-section max-w-xl text-sm text-slate-600">Loading...</div>}>
      <ResetPasswordClient />
    </Suspense>
  );
}
