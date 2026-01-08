export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer (.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Missing Authorization token' }, { status: 401 });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // Read private user doc (Admin SDK bypasses rules)
    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = snap.data() || {};

    const crownPrice = typeof user.crownPrice === 'number' ? user.crownPrice : 0;
    const isActive = Boolean(user.isActive);
    const priceJoinedAt = user.priceJoinedAt ?? null;

    // Write SAFE public queue doc
    await adminDb
      .collection('queueEntries')
      .doc(uid)
      .set(
        {
          crownPrice,
          isActive,
          priceJoinedAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('queue/sync error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
