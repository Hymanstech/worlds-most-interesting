import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { adminAuth, adminDb, adminFieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Missing Authorization token' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { paymentMethodId } = await req.json();

    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid paymentMethodId' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userSnap.data() || {};
    const stripeCustomerId = typeof user.stripeCustomerId === 'string' ? user.stripeCustomerId : '';
    const allowedIds = new Set(
      [user.defaultPaymentMethodId, user.stripeDefaultPaymentMethodId].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
    );

    if (!allowedIds.has(paymentMethodId)) {
      return NextResponse.json({ error: 'Payment method does not belong to this user.' }, { status: 403 });
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const paymentMethodCustomer =
      typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer?.id ?? null;

    if (stripeCustomerId && paymentMethodCustomer && paymentMethodCustomer !== stripeCustomerId) {
      return NextResponse.json({ error: 'Payment method is attached to a different customer.' }, { status: 409 });
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    await userRef.set(
      {
        defaultPaymentMethodId: null,
        stripeDefaultPaymentMethodId: null,
        isActive: false,
        active: false,
        crownPrice: 0,
        cardBrand: null,
        cardLast4: null,
        updatedAt: adminFieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error detaching payment method:', err);

    return NextResponse.json(
      {
        error: 'Failed to detach payment method',
        details: err?.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
