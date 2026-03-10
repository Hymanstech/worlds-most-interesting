import { NextResponse } from 'next/server';
import { adminAuth, adminDb, adminFieldValue } from '@/lib/firebaseAdmin';
import { normalizeSocialHandle } from '@/lib/socialHandles';

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 401 });
  }

  const { uid } = await context.params;
  if (!uid) {
    return NextResponse.json({ error: 'Missing uid.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {
    updatedAt: adminFieldValue.serverTimestamp(),
  };

  if (typeof body.fullName === 'string') patch.fullName = body.fullName.trim();
  if (typeof body.bio === 'string') patch.bio = body.bio.trim();
  if (typeof body.instagramHandle === 'string') {
    patch.instagramHandle = normalizeSocialHandle(body.instagramHandle);
  }
  if (typeof body.xHandle === 'string') {
    patch.xHandle = normalizeSocialHandle(body.xHandle);
  }
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  if (typeof body.crownPrice === 'number' && Number.isFinite(body.crownPrice) && body.crownPrice >= 0) {
    patch.crownPrice = Math.round(body.crownPrice);
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No valid fields provided.' }, { status: 400 });
  }

  await adminDb.collection('users').doc(uid).set(patch, { merge: true });

  return NextResponse.json({ ok: true });
}
