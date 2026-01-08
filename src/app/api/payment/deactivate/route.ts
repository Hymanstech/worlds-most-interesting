export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin'; // <-- adjust if your export path differs


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-11-17.clover" as any,
});

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

    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = snap.data() || {};
    const stripeCustomerId = user.stripeCustomerId as string | undefined;
    const defaultPaymentMethodId = user.defaultPaymentMethodId as string | undefined;

// Best-effort: clear default PM on Stripe customer
if (stripeCustomerId) {
  await stripe.customers
    .update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: undefined,
      },
    })
    .catch(() => {});
}


    // Best-effort: detach PM
    if (defaultPaymentMethodId) {
      await stripe.paymentMethods.detach(defaultPaymentMethodId).catch(() => {});
    }

    // Server-side Firestore update (Admin bypasses rules)
    await userRef.set(
      {
        active: false,
        defaultPaymentMethodId: null,
        cardBrand: null,
        cardLast4: null,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Deactivate route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to deactivate account' },
      { status: 500 }
    );
  }
}
