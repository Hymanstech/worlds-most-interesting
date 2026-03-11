import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import * as postmark from "postmark";

admin.initializeApp();

// Keep costs predictable
setGlobalOptions({
  maxInstances: 1, // nightly job should not scale out
  region: "us-central1",
});

// Use Firebase Secret Manager (recommended)
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const POSTMARK_SERVER_TOKEN = defineSecret("POSTMARK_SERVER_TOKEN");

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

function pickString(u: any, keys: string[]): string {
  for (const k of keys) {
    const v = u?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function buildPublicChampionSnapshot(u: any) {
  return {
    currentChampionName: pickString(u, ["fullName", "displayName", "name"]),
    currentChampionBio: pickString(u, ["bio"]),
    currentChampionPhotoUrl: pickString(u, ["photoUrl", "photoURL", "profilePhotoUrl", "profilePhotoURL"]),
  };
}

function trimForX(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildDailyXPostDraft({
  dateKey,
  championName,
  championBio,
  photoUrl,
  xHandle,
}: {
  dateKey: string;
  championName: string;
  championBio: string;
  photoUrl: string;
  xHandle: string;
}) {
  return buildDailyXPostDraftClean({
    dateKey,
    championName,
    championBio,
    photoUrl,
    xHandle,
  });
}

function trimSentenceClean(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.!,;:\-]+$/, "");
}

function buildDailyXPostDraftClean({
  dateKey,
  championName,
  championBio,
  photoUrl,
  xHandle,
}: {
  dateKey: string;
  championName: string;
  championBio: string;
  photoUrl: string;
  xHandle: string;
}) {
  const displayName = championName.trim() || "Today's champion";
  const bio = trimForX(
    `${trimSentenceClean(championBio || "Wearing the crown for the next 24 hours.")}.`,
    150
  );
  const intro = `${displayName} is today's World's Most Interesting Person.`;
  const cta = "See today's crown: https://www.worldsmostinteresting.com";
  const text = trimForX(`${intro} ${bio} ${cta}`, 280);

  return {
    platform: "x",
    status: "draft",
    dateKey,
    text,
    imageUrl: photoUrl,
    championName: displayName,
    championBio: bio,
    xHandle,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPostmarkClient() {
  const ServerClientCtor =
    (postmark as any).ServerClient || (postmark as any).default?.ServerClient;
  if (!ServerClientCtor) {
    throw new Error("Postmark ServerClient constructor not found (import mismatch).");
  }
  return new ServerClientCtor(POSTMARK_SERVER_TOKEN.value());
}

const LOGO_ATTACHMENT = {
  Name: "wmi-logo-header.png",
  Content: readFileSync(join(__dirname, "../assets/wmi-logo-header.png")).toString("base64"),
  ContentType: "image/png",
  ContentID: "wmi-logo-header",
};

async function sendWinnerEmail({
  toEmail,
  name,
  dateKey,
  profileUrl,
}: {
  toEmail: string;
  name: string;
  dateKey: string;
  profileUrl: string;
}) {
  const client = getPostmarkClient();
  const safeName = escapeHtml((name || "Champion").trim() || "Champion");
  const safeDate = escapeHtml(dateKey);
  const safeProfileUrl = encodeURI(profileUrl);
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 18px;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);border-bottom:1px solid #e2e8f0;">
                <img src="cid:wmi-logo-header" alt="World's Most Interesting" width="245" style="display:block;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">
                  Daily Crown Winner
                </p>
                <h1 style="margin:0 0 14px;font-size:30px;line-height:1.15;color:#0f172a;">
                  You're Wearing the Crown
                </h1>
                <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#1e293b;">
                  ${safeName}, you are today's Most Interesting Person (${safeDate}).
                </p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#334155;">
                  Your profile is now featured on the site. Enjoy the spotlight.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:999px;background:#0f172a;">
                      <a href="${safeProfileUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                        View your crown
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 22px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                  World's Most Interesting
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;

  await client.sendEmail({
    From: "crown@worldsmostinteresting.com",
    To: toEmail,
    Subject: "You're Wearing the Crown - Today's Most Interesting Person",
    HtmlBody: html,
    TextBody: `${safeName}, you are today's Most Interesting Person (${safeDate}). View your crown: ${safeProfileUrl}`,
    Attachments: [LOGO_ATTACHMENT],
    MessageStream: "outbound",
  });
}

async function sendWelcomeEmail({
  toEmail,
  name,
  setupProfileUrl,
}: {
  toEmail: string;
  name: string;
  setupProfileUrl: string;
}) {
  const client = getPostmarkClient();
  const safeName = escapeHtml((name || "there").trim() || "there");
  const safeSetupProfileUrl = encodeURI(setupProfileUrl);
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 18px;background:linear-gradient(135deg,#ecfccb 0%,#d9f99d 48%,#f8fafc 100%);border-bottom:1px solid #d9f99d;">
                <img src="cid:wmi-logo-header" alt="World's Most Interesting" width="245" style="display:block;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#3f6212;font-weight:700;">
                  Welcome
                </p>
                <h1 style="margin:0 0 14px;font-size:30px;line-height:1.15;color:#0f172a;">
                  You're in, ${safeName}
                </h1>
                <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#1e293b;">
                  Your World's Most Interesting account is ready.
                </p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#334155;">
                  Next step: set up your profile, choose your crown price, and make yourself impossible to ignore.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;">
                  <tr>
                    <td style="padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
                      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#0f172a;">
                        What to do next
                      </p>
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                        Add a profile photo, write a short bio, and set the amount you're willing to pay to wear the crown.
                      </p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:999px;background:#14532d;">
                      <a href="${safeSetupProfileUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                        Complete your profile
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 22px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                  World's Most Interesting
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;

  await client.sendEmail({
    From: "crown@worldsmostinteresting.com",
    To: toEmail,
    Subject: "Welcome to World's Most Interesting",
    HtmlBody: html,
    TextBody: `${safeName}, your account is ready. Complete your profile here: ${safeSetupProfileUrl}`,
    Attachments: [LOGO_ATTACHMENT],
    MessageStream: "outbound",
  });
}

export const sendWelcomeEmailOnUserCreate = onDocumentCreated(
  {
    document: "users/{uid}",
    region: "us-central1",
    secrets: [POSTMARK_SERVER_TOKEN],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const user = snap.data() as Record<string, unknown>;
    const toEmail = pickString(user, ["email"]);
    if (!toEmail) {
      console.log("sendWelcomeEmailOnUserCreate skipped (missing email)", { uid: snap.id });
      return;
    }

    const name = pickString(user, ["fullName", "displayName", "name"]);

    try {
      await sendWelcomeEmail({
        toEmail,
        name,
        setupProfileUrl: "https://www.worldsmostinteresting.com/setup/profile",
      });

      await snap.ref.set(
        {
          welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log("sendWelcomeEmailOnUserCreate sent", {
        uid: snap.id,
        email: toEmail,
      });
    } catch (err: any) {
      console.error("sendWelcomeEmailOnUserCreate failed", {
        uid: snap.id,
        email: toEmail,
        err: err?.message || err,
      });
      throw err;
    }
  }
);

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
    secrets: [STRIPE_SECRET_KEY, POSTMARK_SERVER_TOKEN],
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

          const freshUserSnap = await db.collection("users").doc(uid).get();
          const freshUser = freshUserSnap.exists ? freshUserSnap.data() : u;
          const snapshot = buildPublicChampionSnapshot(freshUser);
          if (!snapshot.currentChampionName) {
            console.warn("settleCrownNightly winner has empty champion name", { uid });
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
              ...snapshot,

              lastSettledForDate: dateKey,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          console.log("settleCrownNightly wrote champion snapshot", {
            uid,
            championName: snapshot.currentChampionName,
            bioLength: snapshot.currentChampionBio.length,
            hasPhoto: Boolean(snapshot.currentChampionPhotoUrl),
          });

          await db.collection("crown_events").add({
            type: "NIGHTLY_WIN",
            uid,
            amountCents,
            paymentIntentId: pi.id,
            dateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const crownSnap = await crownRef.get();
          const crownData = crownSnap.exists ? (crownSnap.data() as any) : {};
          if (crownData.lastWinnerEmailSentForDate === dateKey) {
            console.log("settleCrownNightly winner email already sent for date", { uid, dateKey });
          } else {
            const toEmail = pickString(freshUser, ["email"]);
            if (!toEmail) {
              console.log("settleCrownNightly winner email skipped (missing email)", { uid, dateKey });
            } else {
              try {
                await sendWinnerEmail({
                  toEmail,
                  name: snapshot.currentChampionName,
                  dateKey,
                  profileUrl: "https://www.worldsmostinteresting.com/profile",
                });
                await crownRef.set(
                  {
                    lastWinnerEmailSentForDate: dateKey,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );
                console.log("settleCrownNightly winner email sent", { uid, email: toEmail, dateKey });
              } catch (err: any) {
                console.error("settleCrownNightly winner email failed", {
                  uid,
                  email: toEmail,
                  dateKey,
                  err: err?.message || err,
                });
              }
            }
          }

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

async function createOrUpdateDailyXPostDraft({
  dateKey,
  overwrite,
}: {
  dateKey: string;
  overwrite: boolean;
}) {
  const db = admin.firestore();
  const crownRef = db.collection("crownStatus").doc("current");
  const socialRef = db.collection("social_posts").doc(`x-${dateKey}`);

  const [crownSnap, existingDraftSnap] = await Promise.all([crownRef.get(), socialRef.get()]);

  if (!crownSnap.exists) {
    console.log("createOrUpdateDailyXPostDraft skipped (missing crownStatus/current)", { dateKey });
    return { ok: false, reason: "missing_crown_status" as const };
  }

  if (existingDraftSnap.exists && !overwrite) {
    console.log("createOrUpdateDailyXPostDraft skipped (already exists)", { dateKey });
    return { ok: true, skipped: true as const, reason: "already_exists" as const };
  }

  const crown = crownSnap.data() as Record<string, any>;
  const activeUid =
    (typeof crown.activeUid === "string" && crown.activeUid) ||
    (typeof crown.currentChampionUid === "string" && crown.currentChampionUid) ||
    "";

  const snapshotName = pickString(crown, ["currentChampionName"]);
  const snapshotBio = pickString(crown, ["currentChampionBio"]);
  const snapshotPhotoUrl = pickString(crown, ["currentChampionPhotoUrl"]);

  let user: Record<string, any> = {};
  if (activeUid) {
    const userSnap = await db.collection("users").doc(activeUid).get();
    if (userSnap.exists) {
      user = userSnap.data() as Record<string, any>;
    }
  }

  const championName = snapshotName || pickString(user, ["fullName", "displayName", "name"]);
  const championBio = snapshotBio || pickString(user, ["bio"]);
  const photoUrl =
    snapshotPhotoUrl || pickString(user, ["photoUrl", "photoURL", "profilePhotoUrl", "profilePhotoURL"]);
  const xHandle = pickString(user, ["xHandle"]);

  if (!championName) {
    console.log("createOrUpdateDailyXPostDraft skipped (missing champion name)", { dateKey, activeUid });
    return { ok: false, reason: "missing_champion_name" as const, activeUid };
  }

  const draft = buildDailyXPostDraft({
    dateKey,
    championName,
    championBio,
    photoUrl,
    xHandle,
  });

  await socialRef.set(
    {
      ...draft,
      activeUid: activeUid || null,
      source: "crownStatus/current",
      createdAt: existingDraftSnap.exists
        ? existingDraftSnap.get("createdAt") || admin.firestore.FieldValue.serverTimestamp()
        : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await crownRef.set(
    {
      lastXDraftForDate: dateKey,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("createOrUpdateDailyXPostDraft wrote draft", {
    dateKey,
    activeUid,
    overwrite,
    hasImageUrl: Boolean(photoUrl),
    textLength: draft.text.length,
  });

  return {
    ok: true,
    skipped: false as const,
    activeUid,
    hasImageUrl: Boolean(photoUrl),
    textLength: draft.text.length,
  };
}

export const prepareDailyXPostDraft = onSchedule(
  {
    schedule: "35 0 * * *",
    timeZone: "America/Chicago",
  },
  async () => {
    const dateKey = chicagoDateKey(new Date());
    await createOrUpdateDailyXPostDraft({ dateKey, overwrite: false });
  }
);
