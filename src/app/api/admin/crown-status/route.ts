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

// pull a likely uid from the crown doc, regardless of your chosen field name
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

  // fallback: find any field that ends with "uid" and is a string
  for (const [k, v] of Object.entries(crown)) {
    if (typeof v === 'string' && /uid$/i.test(k) && v.trim()) return v;
  }

  return null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    // Try a few common collection names (Firestore is case-sensitive)
    const candidates = ['crownStatus', 'crown_status', 'crown_state', 'crownStatus/current']; // last one is harmless if wrong
    let foundSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let foundPath: string | null = null;

    for (const name of candidates) {
      // If someone put "crownStatus/current" in candidates, normalize it
      const parts = name.split('/');
      const col = parts[0];
      const docId = parts[1] || 'current';

      const ref = adminDb.collection(col).doc(docId);
      const snap = await ref.get();
      if (snap.exists) {
        foundSnap = snap;
        foundPath = `${col}/${docId}`;
        break;
      }
    }

    if (!foundSnap || !foundSnap.exists) {
      return NextResponse.json({
        crown: null,
        debug: { tried: candidates.map((c) => (c.includes('/') ? c : `${c}/current`)) },
      });
    }

    const raw = foundSnap.data() as any;
    const activeUid = extractUid(raw);

    let user: any = null;
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

    return NextResponse.json({
      crown: { ...raw, activeUid, user },
      debug: {
        foundPath,
        rawKeys: raw ? Object.keys(raw) : [],
        extractedUid: activeUid,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
