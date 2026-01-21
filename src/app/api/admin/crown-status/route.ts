import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

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

// Pull a likely uid from the crown doc, regardless of your chosen field name
function extractUid(crown: any): string | null {
  if (!crown || typeof crown !== 'object') return null;

  const direct =
    crown.activeUid ??
    crown.uid ??
    crown.winnerUid ??
    crown.currentUid ??
    crown.userId ??
    crown.targetUid ??
    crown.crownedUid ??
    null;

  if (typeof direct === 'string' && direct.trim()) return direct;

  // Fallback: find any field that ends with "uid" and is a string
  for (const [k, v] of Object.entries(crown)) {
    if (typeof v === 'string' && /uid$/i.test(k) && v.trim()) return v;
  }

  return null;
}

type SafeUser = {
  uid: string;
  fullName?: string;
  email?: string;
  photoUrl?: string;
  bio?: string;
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    // ✅ Always read the exact doc the homepage uses.
    // If you ever truly need to support legacy collection names, do it explicitly,
    // but defaulting to others can hide problems.
    const ref = adminDb.collection('crownStatus').doc('current');
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({
        crown: null,
        debug: {
          tried: ['crownStatus/current'],
          reason: 'Document does not exist',
        },
      });
    }

    const raw = (snap.data() || {}) as any;
    const activeUid = extractUid(raw);

    // Load the live user doc (source of truth for profile fields)
    let user: SafeUser | null = null;
    if (activeUid) {
      const userSnap = await adminDb.collection('users').doc(activeUid).get();
      if (userSnap.exists) {
        const u = userSnap.data() as any;
        user = {
          uid: activeUid,
          fullName: u.fullName || u.displayName || '',
          email: u.email || '',
          photoUrl: u.photoUrl || '',
          bio: u.bio || '',
        };
      } else {
        user = { uid: activeUid };
      }
    }

    // Snapshot fields that the PUBLIC homepage reads from crownStatus/current
    const snapshotChampion = {
      name: raw.currentChampionName || '',
      bio: raw.currentChampionBio || '',
      photoUrl: raw.currentChampionPhotoUrl || '',
    };

    // Live user fields from users/{uid}
    const userChampion = {
      name: user?.fullName || '',
      bio: user?.bio || '',
      photoUrl: user?.photoUrl || '',
    };

    // A consistent "best available" resolution for admin display/debugging:
    // prefer snapshot (what public sees), fallback to user doc (what they have set)
    const resolvedChampion = {
      name: snapshotChampion.name || userChampion.name || '',
      bio: snapshotChampion.bio || userChampion.bio || '',
      photoUrl: snapshotChampion.photoUrl || userChampion.photoUrl || '',
    };

    return NextResponse.json({
      crown: {
        ...raw,
        activeUid,
        user,
        snapshotChampion,
        userChampion,
        resolvedChampion,
      },
      debug: {
        foundPath: 'crownStatus/current',
        rawKeys: Object.keys(raw || {}),
        extractedUid: activeUid,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
