'use client';
import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
type Payment = { id: string; side: string; amountCents: number; countedCents: number; refundedCents: number; disputeStatus: string | null; paymentIntentId: string; livemode: boolean; createdAt: string | null };
type AdminState = { yesCents: number; noCents: number; winner: string; paymentCount: number; paymentsEnabled: boolean; webhookReady: boolean; endsAt: string | null };
const money = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export default function ExperimentAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [endTime, setEndTime] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setReady(true); if (!u) setState(null); }), []);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/admin/experiment', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data.state); setPayments(data.payments); setEnabled(data.state.paymentsEnabled);
      if (data.state.endsAt) { const d = new Date(data.state.endsAt); setEndTime(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); } else setEndTime('');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not load admin data.'); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await signInWithEmailAndPassword(auth, email, password); setPassword(''); }
    catch { setMessage('Sign-in failed. Use your existing administrator account.'); }
    finally { setBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!user) return; setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/experiment', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ paymentsEnabled: enabled, endsAt: endTime ? new Date(endTime).toISOString() : null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessage('Settings saved. Existing checkouts can still finish within their roughly half-hour window.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  }
  return <div className="experiment-admin"><h1>Headline control room</h1>
    {!ready ? <p>Checking administrator session…</p> : !user ? <form onSubmit={login}><p>Administrator access only. Visitors do not need an account.</p><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /><button disabled={busy}>Sign in</button></form> : <>
      <button onClick={() => void load()} disabled={busy}>Refresh ledger</button><button onClick={() => void signOut(auth)}>Sign out</button>
      {state && <><div className="experiment-admin-summary"><span>YES: {money(state.yesCents)}</span><span>NO: {money(state.noCents)}</span><span>{state.paymentCount} payments</span></div><p>Current winner: {state.winner.toUpperCase()} · Webhook: {state.webhookReady ? 'configured' : 'not configured'}</p>
      <form onSubmit={save}><label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy || !state.webhookReady} /> Accept new contributions</label><label htmlFor="end-time">Checkout closing time (your browser’s local time zone; blank for no scheduled end)</label><input id="end-time" type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={busy} /><button disabled={busy}>Save settings</button></form>
      <p className="experiment-admin-message">Refunds are issued in Stripe. The webhook adjusts totals automatically. Pausing closes new checkouts; already opened checkouts can finish. Totals cannot be edited here.</p>
      <div className="experiment-admin-scroll"><table><caption>Most recent 50 confirmed payments</caption><thead><tr><th>Date</th><th>Side</th><th>Paid</th><th>Counted</th><th>Refunded</th><th>Dispute</th><th>Stripe</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td>{p.createdAt ? new Date(p.createdAt).toLocaleString() : 'Pending'}</td><td>{p.side.toUpperCase()}</td><td>{money(p.amountCents)}</td><td>{money(p.countedCents)}</td><td>{money(p.refundedCents)}</td><td>{p.disputeStatus || '—'}</td><td><a href={`https://dashboard.stripe.com/${p.livemode ? '' : 'test/'}payments/${p.paymentIntentId}`} target="_blank" rel="noopener noreferrer">View / refund ↗</a></td></tr>)}</tbody></table>{!payments.length && <p>No confirmed payments yet.</p>}</div></>}
    </>}
    <p className="experiment-admin-message" role="status">{message}</p>
  </div>;
}
