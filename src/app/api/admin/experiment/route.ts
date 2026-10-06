import { NextResponse } from 'next/server';
import { adminDb, adminFieldValue } from '@/lib/firebaseAdmin';
import { getExperimentState, requireExperimentAdmin, sameOrigin } from '@/lib/experimentServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { await requireExperimentAdmin(request); } catch { return NextResponse.json({ error: 'Admin access required.' }, { status: 401 }); }
  try {
    const payments = await adminDb.collection('headlinePayments').orderBy('createdAt', 'desc').limit(50).get();
    return NextResponse.json({ state: await getExperimentState(), payments: payments.docs.map(doc => {
      const p = doc.data();
      return { id: doc.id, side: p.side, amountCents: p.amountCents, countedCents: p.countedCents, refundedCents: p.refundedCents,
        disputeStatus: p.disputeStatus, paymentIntentId: p.paymentIntentId, livemode: p.livemode, createdAt: p.createdAt?.toDate?.().toISOString() || null };
    }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load the ledger.' }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let uid;
  try { uid = await requireExperimentAdmin(request); } catch { return NextResponse.json({ error: 'Admin access required.' }, { status: 401 }); }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body || typeof body.paymentsEnabled !== 'boolean' || !(body.endsAt === null || typeof body.endsAt === 'string' && Number.isFinite(Date.parse(body.endsAt)))) {
    return NextResponse.json({ error: 'Supply an enabled flag and a valid end time or null.' }, { status: 400 });
  }
  try {
    const state = await getExperimentState();
    if (body.paymentsEnabled && !state.webhookReady) return NextResponse.json({ error: 'Payment webhook must be configured before opening checkout.' }, { status: 409 });
    await adminDb.collection('headlineExperiment').doc('current').set({ paymentsEnabled: body.paymentsEnabled, endsAt: body.endsAt === null ? null : new Date(body.endsAt).toISOString(), updatedBy: uid, updatedAt: adminFieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Could not save settings.' }, { status: 503 }); }
}
