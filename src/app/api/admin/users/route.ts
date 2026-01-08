// src/app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

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

    // Either allowlist UID OR custom claim { admin: true }
    const claimAdmin = (decoded as any).admin === true;

    if (!claimAdmin && !isAdminUid(decoded.uid)) {
      return { ok: false as const, error: 'Not authorized (admin only).' };
    }

    return { ok: true as const, uid: decoded.uid };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || 'Token verification failed.' };
  }
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 401 });
  }

  // Read users from Firestore (server-side, bypasses rules)
  const snap = await adminDb.collection('users').get();

  const users = snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      uid: d.id,
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      bio: data.bio ?? '',
      photoUrl: data.photoUrl ?? '',
      crownPrice: typeof data.crownPrice === 'number' ? data.crownPrice : 0,
      isActive: Boolean(data.isActive),
      updatedAt: data.updatedAt ?? null,
    };
  });

  return NextResponse.json({ users });
}
