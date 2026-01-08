// src/app/api/payment/create-setup-intent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Ensure Node runtime for Stripe + firebase-admin
export const runtime = 'nodejs';

// Initialize firebase-admin once
if (!getApps().length) {
  initializeApp();
}
const adminDb = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();

    const body = (await req.json().catch(() => ({}))) as {
      uid?: string;
      email?: string;
    };

    const uid = body.uid?.trim();
    const email = body.email?.trim();

    if (!uid) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    // 1) Load user doc so we can reuse stripeCustomerId
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    let stripeCustomerId: string | undefined =
      userSnap.exists ? (userSnap.data()?.stripeCustomerId as string | undefined) : undefined;

    // 2) Create Stripe customer only once
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: {
          source: 'worlds-most-interesting',
          uid,
        },
      });

      stripeCustomerId = customer.id;

      // Save onto user doc (merge)
      await userRef.set(
        {
          stripeCustomerId,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    // 3) Create SetupIntent (card vaulting)
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    if (!setupIntent.client_secret) {
      throw new Error('Stripe did not return a client_secret for the SetupIntent.');
    }

    return NextResponse.json(
      {
        clientSecret: setupIntent.client_secret,
        customerId: stripeCustomerId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Error creating SetupIntent:', err);

    return NextResponse.json(
      {
        error: 'Failed to create SetupIntent',
        details: err?.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
