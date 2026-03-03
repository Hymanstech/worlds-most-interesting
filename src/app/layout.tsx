// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import AuthNav from '@/components/AuthNav';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: "World's Most Interesting Person",
  description:
    'Set your Crown Price and claim the crown as the World’s Most Interesting Person.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          {/* Header */}
          <header className="border-b border-slate-200/70 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:py-5">
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

              {/* Auth-aware nav */}
              <AuthNav />
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 bg-slate-50">{children}</main>

          {/* Footer */}
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-500">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: copyright */}
                <div>
                  © {new Date().getFullYear()} World&apos;s Most Interesting Person
                </div>

                {/* Right: footer links */}
                <nav className="flex flex-wrap gap-x-4 gap-y-2">
                  <Link
                    href="/how-it-works"
                    className="hover:text-slate-800"
                  >
                    How it works
                  </Link>

                  <Link
                    href="/terms"
                    className="hover:text-slate-800"
                  >
                    Terms
                  </Link>

                  <Link
                    href="/privacy"
                    className="hover:text-slate-800"
                  >
                    Privacy
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
