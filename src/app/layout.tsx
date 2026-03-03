// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import AuthNav from '@/components/AuthNav';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: "World's Most Interesting Person",
  description:
    "Set your Crown Price and claim the crown as the World's Most Interesting Person.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--wash)] text-[var(--ink)] antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200/60 bg-white">
            <div className="wmi-container flex items-center justify-between py-4 sm:py-5">
              <Link href="/" className="flex items-center opacity-95 transition-opacity hover:opacity-100">
                <Image
                  src="/brand/wmi-logo-header.png"
                  alt="World's Most Interesting"
                  width={320}
                  height={64}
                  priority
                  className="h-12 w-auto"
                />
              </Link>

              <AuthNav />
            </div>
          </header>

          <main className="flex-1 bg-[var(--wash)]">{children}</main>

          <footer className="border-t border-slate-200/70 bg-white">
            <div className="wmi-container py-6 text-xs text-slate-500">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>(c) {new Date().getFullYear()} World&apos;s Most Interesting Person</div>

                <nav className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  <Link href="/how-it-works" className="transition-opacity hover:opacity-70">
                    How it works
                  </Link>
                  <Link href="/terms" className="transition-opacity hover:opacity-70">
                    Terms
                  </Link>
                  <Link href="/privacy" className="transition-opacity hover:opacity-70">
                    Privacy
                  </Link>
                  <Link href="/contact" className="transition-opacity hover:opacity-70">
                    Contact
                  </Link>
                </nav>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

