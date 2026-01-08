// src/app/api/admin/assign-crown-now/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // If you don't pin API versions, you can remove this line.
  apiVersion: '2025-02-24.acacia' as any,
});

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error('Missing Authorization header');

  const decoded = await adminAuth.verifyIdToken(match[1]);

  const adminUids = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!adminUids.includes(decoded.uid)) throw new Error('Not authorized');
  return decoded.uid;
}

// Chicago date key (YYYY-MM-DD)
function chicagoDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function resolveAmountCents(userDoc: any, bodyAmountCents?: unknown) {
  // Admin can optionally pass amountCents; otherwise we use user's current offer/price.
  if (typeof bodyAmountCents === 'number' && Number.isFinite(bodyAmountCents)) {
    return Math.round(bodyAmountCents);
  }

  // Prefer cents-based fields
  const cents =
    (typeof userDoc.crownOfferCents === 'number' && userDoc.crownOfferCents) ||
    (typeof userDoc.crownPriceCents === 'number' && userDoc.crownPriceCents) ||
    (typeof userDoc.amountCents === 'number' && userDoc.amountCents) ||
    null;

  if (typeof cents === 'number' && Number.isFinite(cents)) return Math.round(cents);

  // Fallback: dollars-based fields
  const dollars =
    (typeof userDoc.crownPrice === 'number' && userDoc.crownPrice) ||
    (typeof userDoc.amount === 'number' && userDoc.amount) ||
    null;

  if (typeof dollars === 'number' && Number.isFinite(dollars)) return Math.round(dollars * 100);

  return null;
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

    const body = (await request.json().catch(() => ({}))) as any;
    const targetUid = (body?.targetUid as string | undefined) ?? (body?.uid as string | undefined);

    if (!targetUid) {
      return NextResponse.json({ error: 'Missing targetUid' }, { status: 400 });
    }

    // Load target user
    const userRef = adminDb.collection('users').doc(targetUid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const u = userSnap.data() as any;

    const customerId = u.stripeCustomerId;

    // accept either field name
    const paymentMethodId =
      (typeof u.stripeDefaultPaymentMethodId === 'string' && u.stripeDefaultPaymentMethodId) ||
      (typeof u.defaultPaymentMethodId === 'string' && u.defaultPaymentMethodId) ||
      null;

    if (!customerId || !paymentMethodId) {
      return NextResponse.json(
        {
          error:
            'User missing stripeCustomerId or default payment method id (expected stripeDefaultPaymentMethodId or defaultPaymentMethodId).',
        },
        { status: 400 }
      );
    }

    // optional: normalize for future calls
    if (!u.stripeDefaultPaymentMethodId && paymentMethodId) {
      await adminDb.collection('users').doc(targetUid).set(
        {
          stripeDefaultPaymentMethodId: paymentMethodId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const amountCents = resolveAmountCents(u, body?.amountCents);

    // Minimum is 50 cents; change to 100 if you prefer $1 minimum.
    if (!amountCents || !Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json(
        { error: 'Invalid or missing crown offer amount (need >= $0.50)' },
        { status: 400 }
      );
    }

    const settleForDate = chicagoDateKey(new Date());

    // Charge immediately (admin override)
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        description: `ADMIN Assign Crown (${settleForDate})`,
        metadata: {
          uid: targetUid,
          settleForDate,
          purpose: 'crown_admin_assign',
        },
      },
      {
        // Prevents double-charging if admin double-clicks or retries
        idempotencyKey: `admin-assign:${settleForDate}:${targetUid}:${amountCents}`,
      }
    );

    if (paymentIntent.status !== 'succeeded') {
      await adminDb.collection('crown_events').add({
        type: 'ADMIN_ASSIGN_FAIL',
        uid: targetUid,
        amountCents,
        paymentIntentId: paymentIntent.id,
        stripeStatus: paymentIntent.status,
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          error: 'Charge did not succeed',
          stripeStatus: paymentIntent.status,
          paymentIntentId: paymentIntent.id,
        },
        { status: 402 }
      );
    }

    // ✅ Only set the crown AFTER the charge succeeds
    await adminDb.collection('crownStatus').doc('current').set(
      {
        activeUid: targetUid,
        activePriceCents: amountCents,
        activePaymentIntentId: paymentIntent.id,
        activeDateKey: settleForDate,
        activeSince: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await adminDb.collection('crown_events').add({
      type: 'ADMIN_ASSIGN_WIN',
      uid: targetUid,
      amountCents,
      paymentIntentId: paymentIntent.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      uid: targetUid,
      amountCents,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err: any) {
    // Stripe "authentication_required" and similar can land here as StripeError
    const message = err?.message || 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
