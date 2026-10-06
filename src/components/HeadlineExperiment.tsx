'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { parseUsdAmount, validAmount } from '@/lib/experimentAmount';
type Side = 'yes' | 'no';
type PublicState = { yesCents: number; noCents: number; yesStartingCreditCents: number; noMinimumToWinCents: number; winner: Side; paymentsOpen: boolean; endsAt: string | null; paymentCount: number };
const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const sideName = (side: Side) => side === 'yes' ? 'KEEP THE CROWN' : 'ADD THE NOT';
export default function HeadlineExperiment({ initialState }: { initialState: PublicState | null }) {
  const [state, setState] = useState(initialState);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Side>('yes');
  const [previewSide, setPreviewSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState('5');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const requestKey = useRef<string | null>(null);
  const pollBusy = useRef(false);
  const alive = useRef(true);
  const streamConnected = useRef(false);
  const streamRevision = useRef(0);
  const refresh = useCallback(async () => {
    if (pollBusy.current) return;
    pollBusy.current = true;
    const revision = streamRevision.current;
    try {
      const response = await fetch('/api/experiment', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Unavailable');
      const data: PublicState = await response.json();
      if (alive.current && revision === streamRevision.current) { setState(data); setLoadError(''); }
    } catch { if (alive.current && !streamConnected.current) setLoadError('Live totals could not be refreshed. Checkout is paused here until we reconnect.'); }
    finally { pollBusy.current = false; }
  }, []);
  useEffect(() => {
    alive.current = true; void refresh();
    const events = new EventSource('/api/experiment/events');
    events.addEventListener('totals', event => {
      try {
        const data: PublicState = JSON.parse((event as MessageEvent).data);
        if (alive.current) { streamRevision.current++; streamConnected.current = true; setState(data); setLoadError(''); }
      } catch { streamConnected.current = false; void refresh(); }
    });
    events.onerror = () => { streamConnected.current = false; void refresh(); };
    const interval = setInterval(() => { if (!streamConnected.current && document.visibilityState === 'visible') void refresh(); }, 1000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { alive.current = false; streamConnected.current = false; events.close(); clearInterval(interval); clearInterval(clock); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'cancelled') { setPaymentMessage('Checkout cancelled. Nothing was added to either side.'); return; }
    const sessionId = params.get('session_id');
    if (params.get('checkout') !== 'success' || !sessionId) return;
    let stopped = false, attempts = 0;
    let timeout: ReturnType<typeof setTimeout>;
    setPaymentMessage('Checking your payment with Stripe…');
    async function verify() {
      attempts++;
      try {
        const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId!)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (stopped) return;
        if (response.ok && data.status === 'paid') {
          setPaymentMessage(`${money(data.amountCents)} confirmed for ${sideName(data.side)}. Thank you—your payment is in the total.`);
          void refresh(); window.history.replaceState({}, '', '/'); return;
        }
        if (response.ok && data.status === 'reversed') { setPaymentMessage('This payment has been refunded or disputed and is excluded from the total.'); return; }
        if (response.ok && data.status === 'expired') { setPaymentMessage('This checkout expired. Start a new checkout if you still want to participate.'); return; }
      } catch {}
      if (stopped) return;
      if (attempts < 8) timeout = setTimeout(verify, 3000);
      else setPaymentMessage('Payment confirmation is taking longer than usual. Please do not pay again; refresh shortly or contact support with your receipt.');
    }
    void verify();
    return () => { stopped = true; clearTimeout(timeout); };
  }, [refresh]);
  const liveIsNo = state?.winner === 'no';
  const isNo = (previewSide ?? state?.winner ?? 'yes') === 'no';
  const total = (state?.yesCents || 0) + (state?.noCents || 0);
  const yesPercent = total ? (state!.yesCents / total) * 100 : 50;
  const open = !!state?.paymentsOpen && !loadError && (!state.endsAt || now < Date.parse(state.endsAt));
  const gap = state ? liveIsNo ? state.noCents - state.yesCents + 1 : Math.max(state.yesCents - state.noCents + 1, (state.noMinimumToWinCents || 0) - state.noCents) : 0;
  const trailing: Side = liveIsNo ? 'yes' : 'no';
  const flipMinimum = Math.max(100, gap);
  const endLabel = state?.endsAt ? new Date(state.endsAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' }) : null;
  function choose(side: Side) {
    setSelected(side); setAmount('5'); setAccepted(false); setCheckoutError(''); requestKey.current = null;
    dialog.current?.showModal();
  }
  function preview(side: Side) {
    if (busy) return;
    dialog.current?.close();
    setPreviewSide(side); setShareMessage('');
    requestAnimationFrame(() => document.getElementById('winning-preview')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  async function checkout(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setCheckoutError('Enter a dollar amount with up to two decimal places.'); return; }
    const amountCents = parseUsdAmount(amount);
    if (!validAmount(amountCents) || !accepted) { setCheckoutError('Enter a valid amount of at least $1 and accept the terms to continue.'); return; }
    setBusy(true); setCheckoutError('');
    try {
      requestKey.current ||= crypto.randomUUID();
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ side: selected, amountCents, acceptedTerms: accepted, requestId: requestKey.current }), signal: AbortSignal.timeout(30000) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || 'Secure checkout could not be reached. Please try again.');
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Checkout returned an invalid destination.');
      window.location.assign(url.href);
    } catch (error) { setCheckoutError(error instanceof Error ? error.message : 'Could not connect to checkout.'); setBusy(false); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(`Donald Trump is ${liveIsNo ? 'NOT ' : ''}the world’s most interesting person. For now. ${window.location.origin}/`); setShareMessage('Live headline and link copied.'); }
    catch { setShareMessage(`Share this page: ${window.location.origin}/`); }
  }
  return <div className={`duel ${isNo ? 'duel-no' : ''}`}><div className="duel-wrap">
    <div className="duel-edition"><span>A very public difference of opinion.</span><span className="duel-live">{state ? `${sideName(state.winner)} is winning` : 'Connecting to live totals'}</span></div>
    {paymentMessage && <div className="duel-notice" role="status">{paymentMessage}</div>}
    {loadError && <div className="duel-notice duel-error" role="alert">{loadError} <button onClick={() => void refresh()}>Try again</button></div>}
    {previewSide && <div className="duel-preview-banner" id="winning-preview" role="status"><div><strong>PREVIEW · IF {sideName(previewSide)} WINS</strong><p>This is its headline, photo, and bio. Live totals stay unchanged. {state && `The live winner is ${sideName(state.winner)}.`}</p></div><button type="button" onClick={() => { setPreviewSide(null); setShareMessage(''); }}>Back to the live page</button></div>}
    <section className="duel-hero" aria-labelledby="headline"><div><p className="duel-eyebrow">One crown. One word. You decide.</p>
      <h1 id="headline">Donald Trump<br />is {isNo && <span className="duel-not">NOT</span>} the world’s<br />most <em>interesting</em><br />person.</h1>
      <p className="duel-intro">{isNo ? 'The internet has purchased a correction. Same Donald. Less pedestal. One tiny word doing a tremendous amount of work.' : 'Love him. Roll your eyes at him. Somehow, we’re still talking about him. The crown stays—until someone buys the NOT.'}</p>
      <div className="duel-status">{isNo ? '✕' : '♛'} &nbsp; {previewSide ? `${sideName(previewSide)} winning version · PREVIEW` : state ? `${sideName(state.winner)} holds the headline` : 'The starting headline · totals loading'}</div>
      <div className="duel-share"><button onClick={share}>{previewSide ? 'Copy the live headline ↗' : 'Copy this headline ↗'}</button><span role="status">{shareMessage}</span></div></div>
      <figure className="duel-photo"><Image src={`/mockup/assets/${isNo ? 'mugshot.jpg' : 'portrait.png'}`} alt={isNo ? 'Donald Trump’s August 24, 2023 Fulton County booking photo' : 'Official presidential portrait of Donald Trump'} fill priority sizes="(max-width: 760px) 100vw, 50vw" /><div className="duel-stamp">{previewSide ? 'WINNING VERSION PREVIEW' : isNo ? 'THE CROWN HAS BEEN REVOKED' : 'THE REIGNING OPINION'}</div><figcaption><span>{isNo ? 'Courtesy of ADD THE NOT · August 24, 2023' : 'Courtesy of KEEP THE CROWN'}</span><strong>{isNo ? 'A different kind of photo op.' : 'The man. The myth. The headlines.'}</strong></figcaption></figure>
    </section>
    <section className="duel-battle" aria-labelledby="takeover"><div className="duel-battle-top"><h2 id="takeover">Agree? Defend it. Disagree? Edit it.</h2><p>Two sides. One headline. Outfund the other side to flip it.</p></div><div className="duel-meter" aria-hidden="true"><div style={{ width: `${yesPercent}%` }} /><div /></div>
      <div className="duel-sides">{(['yes', 'no'] as const).map(side => <div className={`duel-side duel-side-${side}`} key={side}><div className="duel-side-top"><h3>{sideName(side)} · {side.toUpperCase()}</h3><span className="duel-total">{state ? money(side === 'yes' ? state.yesCents : state.noCents) : '—'}</span></div><p>{side === 'yes' ? 'He’s got your attention. That’s the argument. Keep the portrait, the praise, and the crown.' : 'Most interesting? Please. Add one beautifully petty word—and give this page a reality check.'}</p><button type="button" className="duel-preview-button" aria-pressed={previewSide === side} onClick={() => preview(side)}>Preview this winning page ↗</button>{side === 'yes' && !!state?.yesStartingCreditCents && <small className="duel-credit">Includes {money(state.yesStartingCreditCents)} operator starting credit · not a paid contribution</small>}<button className="duel-contribute" onClick={() => choose(side)} disabled={!open}>{side === 'yes' ? 'Keep the crown ↗' : 'Add the NOT ↗'}</button></div>)}</div>
      <div className="duel-battle-foot"><span>{state ? total === 0 ? 'YES starts with the crown. Waiting for the first contribution.' : `One word changes everything. ${sideName(trailing)} needs ${money(gap)} to take over${gap < 100 ? ' ($1 minimum payment)' : ''}.` : 'Waiting for verified totals.'}</span><span>One-time payments · No account needed · $1 minimum</span></div>
      <p className="duel-payment-note">Satire. Entertainment. One very public argument. Payments increase your side’s total and its chance to control this page; no win or display time is guaranteed. All sales final, except where required by law. Payments go to the independent site operator, with no prizes, payouts, or campaign donations.</p>
      {!open && state && !loadError && <p className="duel-closed" role="status">Contributions are closed. The headline remains on display.</p>}
      {endLabel && <p className="duel-end">{open ? 'New checkouts close' : 'Checkout closing time'}: {endLabel}. Previously opened checkouts can finish within their roughly half-hour window.</p>}
    </section>
    <section className="duel-bio" aria-labelledby="bio-title"><div><p className="duel-eyebrow">{isNo ? 'The reality-check version · ADD THE NOT' : 'The flattering version · KEEP THE CROWN'}</p><h2 id="bio-title">{isNo ? <>All that attention.<br />Still no crown.</> : <>Hard to ignore.<br />Harder to out-headline.</>}</h2><p className="duel-punchline">{isNo ? 'Being the topic is not the same as being the point.' : 'Some people enter a room. He enters the news cycle.'}</p><small>Editorial humor written for this page</small></div><div className="duel-bio-copy">
      <p>{isNo ? 'Businessman. Television personality. Twice elected president. The résumé is public. The superlative is up for argument—and this side would like a word. Specifically: NOT.' : 'Businessman. Television personality. Twice elected to the American presidency. Donald Trump’s career has crossed boardrooms, living rooms, and the Oval Office.'}</p>
      <p>{isNo ? 'The case against the crown: constant attention doesn’t automatically earn the title. Critics see spectacle where supporters see star power. So the pedestal becomes a punchline, and the portrait gives way to his 2023 Fulton County booking photo. This is an editorial take; a booking photo is not proof of guilt.' : 'The case for the crown: business, television, politics—and a talent for keeping the conversation on himself. Supporters see a man who upends expectations. Even his critics keep watching. This side’s argument is simple: you don’t have to like the plot to admit the main character is hard to ignore.'}</p>
      <div className="duel-facts"><div><strong>{isNo ? 'Same person' : '45th & 47th'}</strong><span>{isNo ? 'Different perspective' : 'U.S. president'}</span></div><div><strong>{isNo ? '2023' : 'Business → TV'}</strong><span>{isNo ? 'Booking photo' : 'A public career'}</span></div><div><strong>{isNo ? 'Crown revoked' : 'Crown defended'}</strong><span>An opinion, not a poll</span></div></div>
      <p className="duel-sources">Sources: <a href="https://www.whitehouse.gov/administration/donald-j-trump/" target="_blank" rel="noopener noreferrer">White House biography</a> · <a href="https://commons.wikimedia.org/wiki/File:Donald_Trump_mugshot.jpg" target="_blank" rel="noopener noreferrer">Fulton County photo / Wikimedia</a></p>
    </div></section>
    <section className="duel-rules" id="how"><div><h3>01 / Pick your side.</h3><p>KEEP THE CROWN backs the portrait and praise. ADD THE NOT changes the headline, swaps in the mugshot, and serves the less flattering bio.</p></div><div><h3>02 / Move the total.</h3><p>YES starts with a disclosed $1 operator credit. NO must reach at least $2 and outfund YES to take over. After that, the higher total controls the page; ties keep the current version. Confirmed payments count. Refunds and disputes can change the result.</p></div><div><h3>03 / Watch it flip.</h3><p>A lead is never a lock. The other side can take the page back. The page updates live when confirmed payments change the result. No profiles. No uploads. Just one very public argument.</p></div></section>
  </div>
  <dialog ref={dialog} className="duel-dialog" onCancel={event => { if (busy) event.preventDefault(); }}><button className="duel-dialog-close" aria-label="Close checkout" onClick={() => dialog.current?.close()} disabled={busy}>×</button><p className="duel-eyebrow">One-time headline contribution</p><h2>{selected === 'yes' ? 'Keep the crown.' : 'Add the NOT.'}</h2><p>Your payment increases the <strong>{sideName(selected)}</strong> total. If your side takes the lead, the headline, photo, and bio change.</p>
    <button type="button" className="duel-preview-button" disabled={busy} onClick={() => preview(selected)}>Preview what this side buys ↗</button>
    <form onSubmit={checkout}><label htmlFor="contribution">Amount in USD</label><div className="duel-amounts">{['5', '10', '25'].map(value => <button type="button" key={value} disabled={busy} aria-pressed={amount === value} onClick={() => { setAmount(value); requestKey.current = null; }}>${value}</button>)}{selected === trailing && validAmount(flipMinimum) && <button type="button" disabled={busy} onClick={() => { setAmount((flipMinimum / 100).toFixed(2)); requestKey.current = null; }}>Take the lead · {money(flipMinimum)}</button>}</div>
      <input id="contribution" type="text" inputMode="decimal" value={amount} maxLength={32} onChange={event => { setAmount(event.target.value); requestKey.current = null; }} disabled={busy} required autoComplete="off" aria-describedby="amount-help" /><small id="amount-help">$1 minimum · choose any amount</small>
      <label className="duel-agreement"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={busy} required /><span>I accept the <Link href="/terms" target="_blank">terms</Link> and <Link href="/privacy" target="_blank">privacy policy</Link>. I understand this is satire for entertainment. My payment increases my side’s total, with no guaranteed win or display time and no financial return. All sales are final and non-refundable except where required by law.</span></label>
      {checkoutError && <p className="duel-error" role="alert">{checkoutError}</p>}<button className={`duel-contribute duel-checkout-${selected}`} type="submit" disabled={busy || !open}>{busy ? 'Opening secure checkout…' : `Continue to Stripe · ${/^\d+(\.\d{1,2})?$/.test(amount) ? money(parseUsdAmount(amount) ?? 0) : 'choose an amount'}`}</button><p className="duel-checkout-note">Secure guest checkout by Stripe. No account, recurring charge, prize, or political donation. The other side can overtake you immediately.</p>
    </form>
  </dialog></div>;
}
