import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  try {
    const snap = await adminDb
      .collection('users')
      .where('isActive', '==', true)
      .where('crownPrice', '>', 0)
      .orderBy('crownPrice', 'desc')
      .limit(50)
      .get();

    const highestBid = snap.docs.reduce((max, doc) => {
      const data = doc.data() || {};
      const hasPayment =
        typeof data.stripeCustomerId === 'string' &&
        !!data.stripeCustomerId &&
        (
          (typeof data.defaultPaymentMethodId === 'string' && !!data.defaultPaymentMethodId) ||
          (typeof data.stripeDefaultPaymentMethodId === 'string' && !!data.stripeDefaultPaymentMethodId)
        );

      if (!hasPayment) return max;

      const price = typeof data.crownPrice === 'number' ? data.crownPrice : 0;
      return price > max ? price : max;
    }, 0);

    return NextResponse.json({ highestBid });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load top bid.' },
      { status: 500 }
    );
  }
}
