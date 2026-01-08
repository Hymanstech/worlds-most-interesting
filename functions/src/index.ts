import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Stripe from "stripe";

admin.initializeApp();

// Keep costs predictable
setGlobalOptions({
  maxInstances: 1, // nightly job should not scale out
  region: "us-central1",
});

// Use Firebase Secret Manager (recommended)
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

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
  if (typeof u.crownPriceCents === "number" && Number.isFinite(u.crownPriceCents)) {
    return Math.round(u.crownPriceCents);
  }
  return null;
}

// Tie-break timestamp for equal bids (earliest wins ties)
function tieBreakMillis(u: any): number {
  const t = u.crownPriceUpdatedAt || u.crownOfferUpdatedAt || u.updatedAt || u.createdAt || null;

  // Firestore Timestamp
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export const settleCrownNightly = onSchedule(
  {
    schedule: "5 0 * * *", // 12:05 AM
    timeZone: "America/Chicago",
    secrets: [STRIPE_SECRET_KEY],
  },
  async () => {
    const db = admin.firestore();
    const dateKey = chicagoDateKey(new Date());
    const crownRef = db.collection("crownStatus").doc("current");

    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: "2025-02-24.acacia" as any,
    });

    try {
      // ---- Lock / idempotency guard ----
      const lockState = await db.runTransaction(async (tx) => {
        const snap = await tx.get(crownRef);
        const data = snap.exists ? (snap.data() as any) : {};

        // Already settled today
        if (data.lastSettledForDate === dateKey) return { alreadySettled: true };

        // Another run in progress (give it 10 minutes)
        const inProgressAt: admin.firestore.Timestamp | null = data.settlementInProgressAt || null;
        if (inProgressAt) {
          const ageMs = Date.now() - inProgressAt.toMillis();
          if (ageMs < 10 * 60 * 1000) return { alreadySettling: true };
        }

        tx.set(
          crownRef,
          {
            settlementInProgressAt: admin.firestore.Timestamp.now(),
            settlementInProgressForDate: dateKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return { ok: true };
      });

      if ((lockState as any).alreadySettled) return;
      if ((lockState as any).alreadySettling) return;

      // ---- Load top bidders (by crownPrice only) ----
      const snap = await db
        .collection("users")
        .where("crownPrice", ">", 0)
        .orderBy("crownPrice", "desc")
        .limit(100)
        .get();

      if (snap.empty) {
        await db.collection("crown_events").add({
          type: "NIGHTLY_FAIL",
          uid: "none",
          amountCents: 0,
          dateKey,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          error: "No offers found (no users with crownPrice > 0)",
        });

        await crownRef.set(
          {
            lastAttemptForDate: dateKey,
            lastAttemptResult: "no_candidates",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await clearLock(crownRef);
        return;
      }

      // Only active users
      const candidates = snap.docs
        .map((d) => ({ uid: d.id, u: d.data() as any }))
        .filter(({ u }) => u.isActive === true);

      if (candidates.length === 0) {
        await db.collection("crown_events").add({
          type: "NIGHTLY_FAIL",
          uid: "none",
          amountCents: 0,
          dateKey,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          error: "No active bidders found (all bidders inactive)",
        });

        await crownRef.set(
          {
            lastAttemptForDate: dateKey,
            lastAttemptResult: "no_active_candidates",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await clearLock(crownRef);
        return;
      }

      // Deterministic order: highest price, then earliest timestamp, then uid
      candidates.sort((a, b) => {
        const aPrice = typeof a.u.crownPrice === "number" ? a.u.crownPrice : 0;
        const bPrice = typeof b.u.crownPrice === "number" ? b.u.crownPrice : 0;

        if (bPrice !== aPrice) return bPrice - aPrice;

        const aT = tieBreakMillis(a.u);
        const bT = tieBreakMillis(b.u);
        if (aT !== bT) return aT - bT;

        return a.uid.localeCompare(b.uid);
      });

      // ---- Try charging in sorted order ----
      for (const { uid, u } of candidates) {
        const amountCents = amountCentsFromUser(u);
        const customerId = u.stripeCustomerId;
        const paymentMethodId = paymentMethodFromUser(u);

        if (!amountCents || amountCents < 50) {
          await db.collection("crown_events").add({
            type: "NIGHTLY_FAIL",
            uid,
            amountCents: amountCents || 0,
            dateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            error: "Invalid amount (crownPrice missing/too low)",
          });
          continue;
        }

        if (!customerId || !paymentMethodId) {
          await db.collection("crown_events").add({
            type: "NIGHTLY_FAIL",
            uid,
            amountCents,
            dateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
            await db.collection("crown_events").add({
              type: "NIGHTLY_FAIL",
              uid,
              amountCents,
              paymentIntentId: pi.id,
              stripeStatus: pi.status,
              dateKey,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              error: `Stripe status: ${pi.status}`,
            });
            continue;
          }

          // Winner: set crown AFTER successful charge
          await crownRef.set(
            {
              activeUid: uid,
              activePriceCents: amountCents,
              activePaymentIntentId: pi.id,
              activeDateKey: dateKey,
              activeSince: admin.firestore.Timestamp.now(),
              assignedBy: "nightly",

              lastSettledForDate: dateKey,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          await db.collection("crown_events").add({
            type: "NIGHTLY_WIN",
            uid,
            amountCents,
            paymentIntentId: pi.id,
            dateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await clearLock(crownRef);
          return;
        } catch (err: any) {
          await db.collection("crown_events").add({
            type: "NIGHTLY_FAIL",
            uid,
            amountCents: amountCents || 0,
            dateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("crown_events").add({
        type: "NIGHTLY_FAIL",
        uid: "all",
        amountCents: 0,
        dateKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        error: "All top candidates failed payment",
      });

      await clearLock(crownRef);
    } catch (err: any) {
      try {
        await clearLock(crownRef);
      } catch {}
      console.error("settleCrownNightly error:", err?.message || err);
      throw err;
    }
  }
);
