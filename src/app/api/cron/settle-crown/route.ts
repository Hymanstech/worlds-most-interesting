// src/app/api/cron/settle-crown/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia" as any,
});

function requireCronSecret(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    throw new Error("Unauthorized cron");
  }
}

// "YYYY-MM-DD" in America/Chicago
function chicagoDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function paymentMethodFromUser(u: any): string | null {
  return (
    (typeof u.stripeDefaultPaymentMethodId === "string" && u.stripeDefaultPaymentMethodId) ||
    (typeof u.defaultPaymentMethodId === "string" && u.defaultPaymentMethodId) ||
    null
  );
}

// You store bids as dollars in users.crownPrice -> convert to cents for Stripe
function amountCentsFromUser(u: any): number | null {
  if (typeof u.crownPrice === "number" && Number.isFinite(u.crownPrice)) {
    return Math.round(u.crownPrice * 100);
  }
  // Optional support if you ever add cents later
  if (typeof u.crownPriceCents === "number" && Number.isFinite(u.crownPriceCents)) {
    return Math.round(u.crownPriceCents);
  }
  return null;
}

// Tie-break timestamp for equal bids (earliest wins ties)
// We prefer a bid-specific timestamp if present; otherwise fall back to updatedAt/createdAt.
function tieBreakMillis(u: any): number {
  const t =
    u.crownPriceUpdatedAt ||
    u.crownOfferUpdatedAt ||
    u.updatedAt ||
    u.createdAt ||
    null;

  // Firestore Timestamp object
  if (t && typeof t.toMillis === "function") return t.toMillis();

  // JS Date
  if (t instanceof Date) return t.getTime();

  // numeric millis
  if (typeof t === "number" && Number.isFinite(t)) return t;

  return 0;
}

async function clearLock(crownRef: FirebaseFirestore.DocumentReference) {
  await crownRef.set(
    {
      settlementInProgressAt: null,
      settlementInProgressForDate: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function POST(req: Request) {
  requireCronSecret(req);

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const dateKey = chicagoDateKey(new Date());
  const crownRef = adminDb.collection("crownStatus").doc("current");

  // Force unlock (local dev / emergencies)
  if (force) {
    await clearLock(crownRef);
    return NextResponse.json({ ok: true, forcedUnlock: true, dateKey });
  }

  try {
    // ---- Lock / idempotency guard ----
    const lockState = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(crownRef);
      const data = snap.exists ? (snap.data() as any) : {};

      if (data.lastSettledForDate === dateKey) {
        return { alreadySettled: true };
      }

      const inProgressAt: Timestamp | null = data.settlementInProgressAt || null;
      if (inProgressAt) {
        const ageMs = Date.now() - inProgressAt.toMillis();
        if (ageMs < 10 * 60 * 1000) {
          return { alreadySettling: true };
        }
      }

      tx.set(
        crownRef,
        {
          settlementInProgressAt: Timestamp.now(),
          settlementInProgressForDate: dateKey,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { ok: true };
    });

    if ((lockState as any).alreadySettled) {
      return NextResponse.json({ ok: true, didNothing: true, reason: "alreadySettled", dateKey });
    }
    if ((lockState as any).alreadySettling) {
      return NextResponse.json({ ok: true, didNothing: true, reason: "alreadySettling", dateKey });
    }

    // ---- Load top bidders (by crownPrice only) ----
    // We only order by crownPrice in Firestore to avoid extra composite index requirements.
    const snap = await adminDb
      .collection("users")
      .where("crownPrice", ">", 0)
      .orderBy("crownPrice", "desc")
      .limit(100)
      .get();

    if (snap.empty) {
      await adminDb.collection("crown_events").add({
        type: "NIGHTLY_FAIL",
        uid: "none",
        amountCents: 0,
        dateKey,
        createdAt: FieldValue.serverTimestamp(),
        error: "No offers found (no users with crownPrice > 0)",
      });

      await crownRef.set(
        {
          lastAttemptForDate: dateKey,
          lastAttemptResult: "no_candidates",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await clearLock(crownRef);
      return NextResponse.json({ ok: false, error: "No offers found", dateKey }, { status: 404 });
    }

    // ---- Build candidates, enforce 'active' + sort ties deterministically ----
    const candidates = snap.docs
      .map((d) => ({ uid: d.id, u: d.data() as any }))
      // Improvement #1: skip inactive users
      .filter(({ u }) => u.isActive === true);

    if (candidates.length === 0) {
      await adminDb.collection("crown_events").add({
        type: "NIGHTLY_FAIL",
        uid: "none",
        amountCents: 0,
        dateKey,
        createdAt: FieldValue.serverTimestamp(),
        error: "No active bidders found (all bidders inactive)",
      });

      await crownRef.set(
        {
          lastAttemptForDate: dateKey,
          lastAttemptResult: "no_active_candidates",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await clearLock(crownRef);
      return NextResponse.json({ ok: false, error: "No active offers found", dateKey }, { status: 404 });
    }

    // Improvement #2: consistent tie-breaker (earliest timestamp wins ties)
    candidates.sort((a, b) => {
      const aPrice = typeof a.u.crownPrice === "number" ? a.u.crownPrice : 0;
      const bPrice = typeof b.u.crownPrice === "number" ? b.u.crownPrice : 0;

      if (bPrice !== aPrice) return bPrice - aPrice;

      const aT = tieBreakMillis(a.u);
      const bT = tieBreakMillis(b.u);

      // earliest wins
      if (aT !== bT) return aT - bT;

      // final deterministic tie-break: uid
      return a.uid.localeCompare(b.uid);
    });

    // ---- Try charging in sorted order ----
    for (const { uid, u } of candidates) {
      const amountCents = amountCentsFromUser(u);
      const customerId = u.stripeCustomerId;
      const paymentMethodId = paymentMethodFromUser(u);

      if (!amountCents || amountCents < 50) {
        await adminDb.collection("crown_events").add({
          type: "NIGHTLY_FAIL",
          uid,
          amountCents: amountCents || 0,
          dateKey,
          createdAt: FieldValue.serverTimestamp(),
          error: "Invalid amount (crownPrice missing/too low)",
        });
        continue;
      }

      if (!customerId || !paymentMethodId) {
        await adminDb.collection("crown_events").add({
          type: "NIGHTLY_FAIL",
          uid,
          amountCents,
          dateKey,
          createdAt: FieldValue.serverTimestamp(),
          error: "Missing stripeCustomerId or default payment method id",
        });
        continue;
      }

      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: "usd",
            customer: customerId,
            payment_method: paymentMethodId,
            confirm: true,
            off_session: true,
            description: `Crown Winner Charge (${dateKey})`,
            metadata: { uid, dateKey, purpose: "crown_nightly" },
          },
          { idempotencyKey: `nightly:${dateKey}:${uid}:${amountCents}` }
        );

        if (pi.status !== "succeeded") {
          await adminDb.collection("crown_events").add({
            type: "NIGHTLY_FAIL",
            uid,
            amountCents,
            paymentIntentId: pi.id,
            stripeStatus: pi.status,
            dateKey,
            createdAt: FieldValue.serverTimestamp(),
            error: `Stripe status: ${pi.status}`,
          });
          continue;
        }

        // Winner!
        await crownRef.set(
          {
            activeUid: uid,
            activePriceCents: amountCents,
            activePaymentIntentId: pi.id,
            activeDateKey: dateKey,
            activeSince: Timestamp.now(),
            assignedBy: "nightly",

            lastSettledForDate: dateKey,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await adminDb.collection("crown_events").add({
          type: "NIGHTLY_WIN",
          uid,
          amountCents,
          paymentIntentId: pi.id,
          dateKey,
          createdAt: FieldValue.serverTimestamp(),
        });

        await clearLock(crownRef);
        return NextResponse.json({
          ok: true,
          winnerUid: uid,
          amountCents,
          paymentIntentId: pi.id,
          dateKey,
        });
      } catch (err: any) {
        await adminDb.collection("crown_events").add({
          type: "NIGHTLY_FAIL",
          uid,
          amountCents: amountCents || 0,
          dateKey,
          createdAt: FieldValue.serverTimestamp(),
          error: err?.message || "Charge error",
        });
        continue;
      }
    }

    // All failed
    await crownRef.set(
      {
        lastAttemptForDate: dateKey,
        lastAttemptResult: "all_failed",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await adminDb.collection("crown_events").add({
      type: "NIGHTLY_FAIL",
      uid: "all",
      amountCents: 0,
      dateKey,
      createdAt: FieldValue.serverTimestamp(),
      error: "All top candidates failed payment",
    });

    await clearLock(crownRef);
    return NextResponse.json({ ok: false, error: "All top offers failed", dateKey }, { status: 402 });
  } catch (err: any) {
    try {
      await clearLock(crownRef);
    } catch {}
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
