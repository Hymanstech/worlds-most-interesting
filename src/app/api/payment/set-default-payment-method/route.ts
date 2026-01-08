export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin'; // <-- adjust if your export path differs

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
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

    const body = (await req.json().catch(() => ({}))) as any;
    const paymentMethodId = body.paymentMethodId as string | undefined;

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'Missing paymentMethodId' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = snap.data() || {};
    const stripeCustomerId = user.stripeCustomerId as string | undefined;

    // Retrieve PM details from Stripe (brand/last4)
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const brand = (pm as any)?.card?.brand ?? null;
    const last4 = (pm as any)?.card?.last4 ?? null;

    // If we have a customer, set default PM on the customer
    if (stripeCustomerId) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Mark active + store PM metadata server-side
    await userRef.set(
      {
        active: true,
        defaultPaymentMethodId: paymentMethodId,
        cardBrand: brand,
        cardLast4: last4,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Set default PM route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to save payment method' },
      { status: 500 }
    );
  }
}
