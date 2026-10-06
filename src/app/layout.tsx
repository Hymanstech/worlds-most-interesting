import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import './experiment.css';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.worldsmostinteresting.com'),
  title: 'World’s Most Interesting Person — One crown. One word.',
  description: 'Keep the crown or add the NOT. The higher paid total controls the page. An independent humor experiment.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="experiment-shell">
    <header className="experiment-header"><Link href="/" className="experiment-brand" aria-label="World’s Most Interesting Person home"><span aria-hidden="true">♛</span><span>World’s Most<br />Interesting Person</span></Link><Link href="/how-it-works">How to change the headline ↗</Link></header>
    <main>{children}</main>
    <footer className="experiment-footer"><div>An independent humor experiment. No candidate or campaign affiliation.<br />Payments go to the site operator. No prizes, payouts, or campaign donations.</div><nav aria-label="Footer"><Link href="/how-it-works">How it works</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link></nav></footer>
  </body></html>;
}
