import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { EXPERIMENT_ID, isOpen, isSide, validAmount } from '@/lib/experiment';
import { allowRequest, getExperimentState, sameOrigin, siteOrigin } from '@/lib/experimentServer';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 4096) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body || !isSide(body.side) || !validAmount(body.amountCents) || body.acceptedTerms !== true ||
      typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) {
    return NextResponse.json({ error: 'Choose a side, enter $1–$500, and accept the terms.' }, { status: 400 });
  }
  try {
    const state = await getExperimentState();
    if (!isOpen(state)) return NextResponse.json({ error: 'Contributions are currently closed.' }, { status: 409 });
    if (!await allowRequest(request, 'checkout')) return NextResponse.json({ error: 'Too many checkout attempts. Please wait a few minutes.' }, { status: 429 });
    const stripe = getStripe();
    const name = body.side === 'yes' ? 'Keep the crown' : 'Add the NOT';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], submit_type: 'pay',
      line_items: [{ quantity: 1, price_data: {
        currency: 'usd', unit_amount: body.amountCents,
        product_data: { name: `${name} — headline contribution`, description: 'One-time payment toward control of the World’s Most Interesting Person headline. No prize, payout, or guaranteed lead.' },
      } }],
      metadata: { experiment: EXPERIMENT_ID, side: body.side, termsVersion: '2026-10-06' },
      payment_intent_data: { metadata: { experiment: EXPERIMENT_ID, side: body.side }, description: `WMI headline experiment: ${name}` },
      success_url: `${siteOrigin()}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin()}/?checkout=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      custom_text: { submit: { message: 'This is a one-time payment to the independent site operator, not a campaign donation. The other side can overtake your total. No financial return.' } },
    }, { idempotencyKey: `${EXPERIMENT_ID}:${body.requestId}:${body.side}:${body.amountCents}` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Headline checkout failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'Checkout is temporarily unavailable. No payment was taken here. Please try again.' }, { status: 503 });
  }
}
