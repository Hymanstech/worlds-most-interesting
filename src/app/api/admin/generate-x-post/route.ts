import { NextResponse } from 'next/server';
import { adminAuth, adminDb, adminFieldValue } from '@/lib/firebaseAdmin';

function isAdminUid(uid: string) {
  const allow = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return allow.includes(uid);
}

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false as const, error: 'Missing Authorization Bearer token.' };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded?.uid) {
      return { ok: false as const, error: 'Invalid token.' };
    }

    const claimAdmin = (decoded as any).admin === true;
    if (!claimAdmin && !isAdminUid(decoded.uid)) {
      return { ok: false as const, error: 'Not authorized (admin only).' };
    }

    return { ok: true as const, uid: decoded.uid };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || 'Token verification failed.' };
  }
}

function chicagoDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function pickString(u: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = u[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function trimForX(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function buildDailyXPostDraft(input: {
  dateKey: string;
  championName: string;
  championBio: string;
  photoUrl: string;
  xHandle: string;
}) {
  const displayName = input.championName.trim() || "Today's champion";
  const handlePart = input.xHandle ? ` (${input.xHandle})` : '';
  const intro = `${displayName}${handlePart} is today's World's Most Interesting Person.`;
  const bio = trimForX(input.championBio || 'Wearing the crown for the next 24 hours.', 120);
  const cta = "See today's crown: https://www.worldsmostinteresting.com";
  const text = trimForX(`${intro} ${bio} ${cta}`, 280);

  return {
    platform: 'x',
    status: 'draft',
    dateKey: input.dateKey,
    text,
    imageUrl: input.photoUrl,
    championName: displayName,
    championBio: bio,
    xHandle: input.xHandle,
  };
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    dateKey?: string;
    overwrite?: boolean;
  };

  const dateKey = body.dateKey?.trim() || chicagoDateKey(new Date());
  const overwrite = body.overwrite !== false;

  const crownRef = adminDb.collection('crownStatus').doc('current');
  const socialRef = adminDb.collection('social_posts').doc(`x-${dateKey}`);

  const [crownSnap, existingDraftSnap] = await Promise.all([crownRef.get(), socialRef.get()]);

  if (!crownSnap.exists) {
    return NextResponse.json({ error: 'Missing crownStatus/current.' }, { status: 404 });
  }

  if (existingDraftSnap.exists && !overwrite) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'already_exists',
      dateKey,
    });
  }

  const crown = (crownSnap.data() || {}) as Record<string, unknown>;
  const activeUid =
    (typeof crown.activeUid === 'string' && crown.activeUid) ||
    (typeof crown.currentChampionUid === 'string' && crown.currentChampionUid) ||
    '';

  let user: Record<string, unknown> = {};
  if (activeUid) {
    const userSnap = await adminDb.collection('users').doc(activeUid).get();
    if (userSnap.exists) {
      user = (userSnap.data() || {}) as Record<string, unknown>;
    }
  }

  const championName =
    pickString(crown, ['currentChampionName']) ||
    pickString(user, ['fullName', 'displayName', 'name']);
  const championBio =
    pickString(crown, ['currentChampionBio']) ||
    pickString(user, ['bio']);
  const photoUrl =
    pickString(crown, ['currentChampionPhotoUrl']) ||
    pickString(user, ['photoUrl', 'photoURL', 'profilePhotoUrl', 'profilePhotoURL']);
  const xHandle = pickString(user, ['xHandle']);

  if (!championName) {
    return NextResponse.json({ error: 'Could not determine champion name.' }, { status: 400 });
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
      source: 'crownStatus/current',
      generatedBy: gate.uid,
      createdAt: existingDraftSnap.exists
        ? existingDraftSnap.get('createdAt') || adminFieldValue.serverTimestamp()
        : adminFieldValue.serverTimestamp(),
      updatedAt: adminFieldValue.serverTimestamp(),
      lastGeneratedAt: adminFieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await crownRef.set(
    {
      lastXDraftForDate: dateKey,
      updatedAt: adminFieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    dateKey,
    activeUid: activeUid || null,
    text: draft.text,
    imageUrl: draft.imageUrl,
  });
}
