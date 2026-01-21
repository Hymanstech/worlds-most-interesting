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

// YYYY-MM-DD in America/Chicago
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
    (typeof u?.stripeDefaultPaymentMethodId === "string" && u.stripeDefaultPaymentMethodId) ||
    (typeof u?.defaultPaymentMethodId === "string" && u.defaultPaymentMethodId) ||
    null
  );
}

function amountCentsFromUser(u: any): number | null {
  if (typeof u?.crownPrice === "number" && Number.isFinite(u.crownPrice)) {
    return Math.round(u.crownPrice * 100);
  }
  if (typeof u?.crownPriceCents === "number" && Number.isFinite(u.crownPriceCents)) {
    return Math.round(u.crownPriceCents);
  }
  return null;
}

function tieBreakMillis(u: any): number {
  const t = u?.crownPriceUpdatedAt || u?.crownOfferUpdatedAt || u?.updatedAt || u?.createdAt || null;
  if (t && typeof t.toMillis === "function") return t.toMillis();
  if (t instanceof Date) return t.getTime();
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

function pickString(u: any, keys: string[]): string {
  for (const k of keys) {
    const v = u?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// 🔑 EXACT same snapshot logic as manual assign
function buildPublicChampionSnapshot(u: any) {
  const name = pickString(u, ["fullName", "displayName", "name", "username", "handle"]);
  const bio = pickString(u, ["bio", "about", "description", "profileBio"]);
  const photoUrl = pickString(u, [
    "photoUrl",
    "photoURL",
    "profilePhotoUrl",
    "profilePhotoURL",
    "avatarUrl",
    "avatarURL",
    "imageUrl",
    "imageURL",
  ]);

  return {
    currentChampionName: name || "No champion yet",
    currentChampionBio: bio || "",
    currentChampionPhotoUrl: photoUrl || "",
  };
}

export async function POST(req: Request) {
  requireCronSecret(req);

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const dateKey = chicagoDateKey(new Date());
  const crownRef = adminDb.collection("crownStatus").doc("current");

  if (force) {
    await clearLock(crownRef);
    return NextResponse.json({ ok: true, forcedUnlock: true, dateKey });
  }

  try {
    // ---------- Lock ----------
    const lock = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(crownRef);
      const data = snap.exists ? (snap.data() as any) : {};

      if (data.lastSettledForDate === dateKey) return { alreadySettled: true };

      if (data.settlementInProgressAt) {
        const ageMs = Date.now() - data.settlementInProgressAt.toMillis();
        if (ageMs < 10 * 60 * 1000) return { alreadySettling: true };
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

    if (lock.alreadySettled || lock.alreadySettling) {
      return NextResponse.json({ ok: true, didNothing: true, dateKey });
    }

    // ---------- Candidates ----------
    const snap = await adminDb
      .collection("users")
      .where("crownPrice", ">", 0)
      .orderBy("crownPrice", "desc")
      .limit(100)
      .get();

    const candidates = snap.docs
      .map((d) => ({ uid: d.id, u: d.data() }))
      .filter(({ u }) => u?.isActive === true);

    candidates.sort((a, b) => {
      if (b.u.crownPrice !== a.u.crownPrice) return b.u.crownPrice - a.u.crownPrice;
      return tieBreakMillis(a.u) - tieBreakMillis(b.u);
    });

    // ---------- Charge Loop ----------
    for (const { uid, u } of candidates) {
      const amountCents = amountCentsFromUser(u);
      const customerId = u.stripeCustomerId;
      const paymentMethodId = paymentMethodFromUser(u);

      if (!amountCents || !customerId || !paymentMethodId) continue;

      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          customer: customerId,
          payment_method: paymentMethodId,
          confirm: true,
          off_session: true,
          description: `Crown Winner Charge (${dateKey})`,
          metadata: { uid, dateKey },
        },
        { idempotencyKey: `nightly:${dateKey}:${uid}:${amountCents}` }
      );

      if (pi.status !== "succeeded") continue;

      // 🔑 Re-fetch user fresh (critical)
      const freshSnap = await adminDb.collection("users").doc(uid).get();
      const freshUser = freshSnap.exists ? freshSnap.data() : u;

      const snapshot = buildPublicChampionSnapshot(freshUser);

      await crownRef.set(
        {
          activeUid: uid,
          currentChampionUid: uid,
          activePriceCents: amountCents,
          activePaymentIntentId: pi.id,
          activeDateKey: dateKey,
          activeSince: Timestamp.now(),
          assignedBy: "nightly",

          ...snapshot,

          // cleanup
          updatedByAdminUid: FieldValue.delete(),

          lastSettledForDate: dateKey,
          lastNightlySnapshot: snapshot,

          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await clearLock(crownRef);

      return NextResponse.json({ ok: true, uid, snapshot });
    }

    await clearLock(crownRef);
    return NextResponse.json({ ok: false, error: "No successful charges" }, { status: 402 });
  } catch (err: any) {
    try {
      await clearLock(crownRef);
    } catch {}
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
