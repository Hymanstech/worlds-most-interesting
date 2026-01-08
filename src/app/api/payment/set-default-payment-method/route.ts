// src/app/api/payment/set-default-method/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer (.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization token" },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = (await req.json().catch(() => ({}))) as any;
    const paymentMethodId =
      typeof body.paymentMethodId === "string" ? body.paymentMethodId : undefined;

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: "Missing paymentMethodId" },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection("users").doc(uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = (snap.data() || {}) as any;
    const stripeCustomerId =
      typeof user.stripeCustomerId === "string" ? user.stripeCustomerId : undefined;

    const stripe = getStripe();

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
        isActive: true, // <-- use whatever your app expects (active vs isActive)
        stripeDefaultPaymentMethodId: paymentMethodId, // keep in sync with charging code
        defaultPaymentMethodId: paymentMethodId, // optional compatibility
        cardBrand: brand,
        cardLast4: last4,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Set default PM route error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save payment method" },
      { status: 500 }
    );
  }
}
