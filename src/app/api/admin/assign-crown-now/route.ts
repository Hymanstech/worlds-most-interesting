// src/app/api/admin/assign-crown-now/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
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

function chicagoDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function resolveAmountCents(userDoc: any, bodyAmountCents?: unknown) {
  if (typeof bodyAmountCents === 'number' && Number.isFinite(bodyAmountCents)) {
    return Math.round(bodyAmountCents);
  }

  const cents =
    (typeof userDoc.crownOfferCents === 'number' && userDoc.crownOfferCents) ||
    (typeof userDoc.crownPriceCents === 'number' && userDoc.crownPriceCents) ||
    (typeof userDoc.amountCents === 'number' && userDoc.amountCents) ||
    null;

  if (typeof cents === 'number' && Number.isFinite(cents)) return Math.round(cents);

  const dollars =
    (typeof userDoc.crownPrice === 'number' && userDoc.crownPrice) ||
    (typeof userDoc.amount === 'number' && userDoc.amount) ||
    null;

  if (typeof dollars === 'number' && Number.isFinite(dollars)) return Math.round(dollars * 100);

  return null;
}

function buildPublicChampionSnapshot(u: any) {
  const name =
    (typeof u.fullName === 'string' && u.fullName) ||
    (typeof u.name === 'string' && u.name) ||
    '';

  const bio = (typeof u.bio === 'string' && u.bio) || '';

  const photoUrl =
    (typeof u.photoUrl === 'string' && u.photoUrl) ||
    (typeof u.profilePhotoUrl === 'string' && u.profilePhotoUrl) ||
    '';

  return {
    currentChampionName: String(name || '').trim() || 'No champion yet',
    currentChampionBio: String(bio || '').trim(),
    currentChampionPhotoUrl: String(photoUrl || '').trim(),
  };
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

    const body = (await request.json().catch(() => ({}))) as any;
    const targetUid = (body?.targetUid as string | undefined) ?? (body?.uid as string | undefined);
    const force = body?.force === true;

    if (!targetUid) {
      return NextResponse.json({ error: 'Missing targetUid' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(targetUid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const u = userSnap.data() as any;
    const customerId = u.stripeCustomerId;
    const paymentMethodId =
      (typeof u.stripeDefaultPaymentMethodId === 'string' && u.stripeDefaultPaymentMethodId) ||
      (typeof u.defaultPaymentMethodId === 'string' && u.defaultPaymentMethodId) ||
      null;
    const warnings: string[] = [];

    if (!customerId || !paymentMethodId) {
      warnings.push(
        'Missing stripeCustomerId or default payment method id (expected stripeDefaultPaymentMethodId or defaultPaymentMethodId).'
      );
    }

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
    if (!amountCents || !Number.isFinite(amountCents) || amountCents < 50) {
      warnings.push('Invalid or missing crown offer amount (need >= $0.50).');
    }

    const settleForDate = chicagoDateKey(new Date());
    let paymentIntent: Stripe.PaymentIntent | null = null;
    let paymentIntentId: string | null = null;

    if (warnings.length > 0 && !force) {
      return NextResponse.json(
        {
          error: 'Admin override required before assigning this crown.',
          warnings,
          canForce: true,
        },
        { status: 409 }
      );
    }

    if (warnings.length === 0) {
      const chargeAmountCents = amountCents as number;
      try {
        paymentIntent = await stripe.paymentIntents.create(
          {
            amount: chargeAmountCents,
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
            idempotencyKey: `admin-assign:${settleForDate}:${targetUid}:${chargeAmountCents}`,
          }
        );

        paymentIntentId = paymentIntent.id;

        if (paymentIntent.status !== 'succeeded') {
          warnings.push(`Charge did not succeed (status: ${paymentIntent.status}).`);
        }
      } catch (err: any) {
        warnings.push(`Charge failed: ${err?.message || 'Unknown Stripe error.'}`);
      }
    }

    if (warnings.length > 0) {
      await adminDb.collection('crown_events').add({
        type: force ? 'ADMIN_ASSIGN_FORCED' : 'ADMIN_ASSIGN_FAIL',
        uid: targetUid,
        amountCents: amountCents || 0,
        paymentIntentId,
        stripeStatus: paymentIntent?.status || null,
        error: warnings.join(' '),
        warnings,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (warnings.length > 0 && !force) {
      return NextResponse.json(
        {
          error: 'Admin override required before assigning this crown.',
          warnings,
          canForce: true,
          paymentIntentId,
          stripeStatus: paymentIntent?.status || null,
        },
        { status: 409 }
      );
    }

    const snapshot = buildPublicChampionSnapshot(u);

    await adminDb.collection('crownStatus').doc('current').set(
      {
        activeUid: targetUid,
        activePriceCents: amountCents || 0,
        activePaymentIntentId: paymentIntentId,
        activeDateKey: settleForDate,
        activeSince: Timestamp.now(),
        assignedBy: warnings.length > 0 ? 'admin_forced' : 'admin',
        ...snapshot,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (warnings.length === 0) {
      await adminDb.collection('crown_events').add({
        type: 'ADMIN_ASSIGN_WIN',
        uid: targetUid,
        amountCents,
        paymentIntentId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({
      ok: true,
      uid: targetUid,
      amountCents: amountCents || 0,
      paymentIntentId,
      forced: warnings.length > 0,
      warnings,
    });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
