import { createHash } from 'node:crypto';
import { adminAuth, adminDb, adminFieldValue } from '@/lib/firebaseAdmin';
import { isOpen, readState, type Side } from '@/lib/experiment';

export async function getExperimentState() {
  const snap = await adminDb.collection('headlineExperiment').doc('current').get();
  return readState(snap.data());
}

export async function reserveCheckoutRequest(side: Side, amountCents: number, requestId: string, now = Date.now()) {
  const ref = adminDb.collection('headlineCheckoutRequests').doc(`${requestId}-${side}-${amountCents}`);
  const request = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.data();
    if (existing) return { expiresAtSeconds: Number(existing.expiresAtSeconds), sessionUrl: typeof existing.sessionUrl === 'string' ? existing.sessionUrl : null };
    const created = { side, amountCents, expiresAtSeconds: Math.floor(now / 1000) + 1860,
      expiresAt: new Date(now + 48 * 3600000), sessionUrl: null, createdAt: adminFieldValue.serverTimestamp() };
    tx.set(ref, created);
    return { expiresAtSeconds: created.expiresAtSeconds, sessionUrl: created.sessionUrl };
  });
  return { ref, ...request };
}

export function publicState(state: ReturnType<typeof readState>) {
  return {
    yesCents: state.yesCents, noCents: state.noCents, winner: state.winner,
    paymentsOpen: isOpen(state), endsAt: state.endsAt, paymentCount: state.paymentCount,
  };
}

export async function requireExperimentAdmin(request: Request) {
  const match = request.headers.get('authorization')?.match(/^Bearer (.+)$/);
  if (!match) throw new Error('Unauthorized');
  const token = await adminAuth.verifyIdToken(match[1], true);
  const uids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim());
  if (token.admin !== true && !uids.includes(token.uid)) throw new Error('Unauthorized');
  return token.uid;
}

export function siteOrigin() {
  const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.worldsmostinteresting.com';
  return new URL(origin).origin;
}

export function sameOrigin(request: Request) {
  const allowed = [siteOrigin()];
  if (siteOrigin() === 'https://www.worldsmostinteresting.com') allowed.push('https://worldsmostinteresting.com');
  if (process.env.NODE_ENV !== 'production') allowed.push(new URL(request.url).origin);
  return allowed.includes(request.headers.get('origin') || '');
}

// Shared Firestore window instead of an in-memory limit that resets per server.
export async function allowRequest(request: Request, kind: 'checkout' | 'status') {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const window = Math.floor(Date.now() / 600000);
  const key = createHash('sha256').update(`${kind}:${ip}:${window}`).digest('hex');
  const ref = adminDb.collection('headlineRateLimits').doc(key);
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.count) || 0;
    if (count >= (kind === 'checkout' ? 15 : 90)) return false;
    tx.set(ref, { count: count + 1, expiresAt: new Date((window + 2) * 600000) });
    return true;
  });
}
