import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { reconcileSession } from '@/lib/experiment';
import { allowRequest } from '@/lib/experimentServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !/^cs_(test_|live_)?[a-zA-Z0-9]{12,240}$/.test(sessionId)) return NextResponse.json({ error: 'Invalid checkout reference.' }, { status: 400 });
  try {
    if (!await allowRequest(request, 'status')) return NextResponse.json({ error: 'Please wait before checking again.' }, { status: 429 });
    const result = await reconcileSession(adminDb, getStripe(), sessionId);
    if (!result) return NextResponse.json({ error: 'Checkout not found.' }, { status: 404 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'We could not verify this payment yet. Refresh shortly or contact support with your receipt.' }, { status: 503 });
  }
}
