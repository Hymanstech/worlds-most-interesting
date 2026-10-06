import { NextResponse } from 'next/server';
import { getExperimentState, publicState } from '@/lib/experimentServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(publicState(await getExperimentState()), { headers: { 'Cache-Control': 'no-store', 'X-WMI-Version': 'headline-1.3' } });
  } catch {
    return NextResponse.json({ error: 'Live totals are temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
