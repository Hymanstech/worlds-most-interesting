import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

function isAdminUid(uid: string) {
  const allow = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return allow.includes(uid);
}

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false as const, error: 'Missing Authorization Bearer token.' };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded?.uid) {
      return { ok: false as const, error: 'Invalid token.' };
    }

    const claimAdmin = (decoded as any).admin === true;

    if (!claimAdmin && !isAdminUid(decoded.uid)) {
      return { ok: false as const, error: 'Not authorized (admin only).' };
    }

    return { ok: true as const, uid: decoded.uid };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || 'Token verification failed.' };
  }
}

function toIso(value: any): string | null {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 401 });
  }

  const snap = await adminDb
    .collection('crown_events')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const uidSet = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (typeof data.uid === 'string' && data.uid && data.uid !== 'none' && data.uid !== 'all') {
      uidSet.add(data.uid);
    }
  }

  const userDocs = await Promise.all(
    Array.from(uidSet).map(async (uid) => {
      const userSnap = await adminDb.collection('users').doc(uid).get();
      return [uid, userSnap.exists ? userSnap.data() || {} : {}] as const;
    })
  );

  const usersByUid = new Map(userDocs);

  const events = snap.docs.map((doc) => {
    const data = doc.data() || {};
    const uid = typeof data.uid === 'string' ? data.uid : '';
    const user = usersByUid.get(uid) || {};

    return {
      id: doc.id,
      type: data.type ?? '',
      uid,
      fullName: user.fullName ?? user.displayName ?? '',
      email: user.email ?? '',
      amountCents: typeof data.amountCents === 'number' ? data.amountCents : 0,
      paymentIntentId: data.paymentIntentId ?? '',
      stripeStatus: data.stripeStatus ?? '',
      dateKey: data.dateKey ?? '',
      error: data.error ?? '',
      createdAt: toIso(data.createdAt),
    };
  });

  const winners = events.filter((event) => event.type === 'NIGHTLY_WIN' || event.type === 'ADMIN_ASSIGN_WIN');
  const failures = events.filter((event) => event.type === 'NIGHTLY_FAIL' || event.type === 'ADMIN_ASSIGN_FAIL');

  return NextResponse.json({
    events,
    winners: winners.slice(0, 12),
    failures: failures.slice(0, 12),
  });
}
