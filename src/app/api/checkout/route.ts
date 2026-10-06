import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { EXPERIMENT_ID, isOpen, isSide, validAmount } from '@/lib/experiment';
import { allowRequest, getExperimentState, reserveCheckoutRequest, sameOrigin, siteOrigin } from '@/lib/experimentServer';
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
    return NextResponse.json({ error: 'Choose a side, enter a valid amount of at least $1, and accept the terms.' }, { status: 400 });
  }
  try {
    const state = await getExperimentState();
    if (!isOpen(state)) return NextResponse.json({ error: 'Contributions are currently closed.' }, { status: 409 });
    if (!await allowRequest(request, 'checkout')) return NextResponse.json({ error: 'Too many checkout attempts. Please wait a few minutes.' }, { status: 429 });
    // Reserve one expiry before contacting Stripe. Retries on another server
    // use identical parameters; a completed creation reuses its stored URL.
    const checkoutRequest = await reserveCheckoutRequest(body.side, body.amountCents, body.requestId);
    if (checkoutRequest.expiresAtSeconds <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: 'This checkout attempt expired. Close this dialog and open a new contribution.' }, { status: 409 });
    }
    if (checkoutRequest.sessionUrl) return NextResponse.json({ url: checkoutRequest.sessionUrl });
    const stripe = getStripe();
    const name = body.side === 'yes' ? 'Keep the crown' : 'Add the NOT';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], submit_type: 'pay',
      line_items: [{ quantity: 1, price_data: {
        currency: 'usd', unit_amount: body.amountCents,
        product_data: { name: `${name} — headline points`, description: 'Satirical entertainment: $1 buys 1 point. Starting scores YES 1764 / NO 1763 are not previous purchases. No guaranteed win or display time. All sales final except where required by law.' },
      } }],
      metadata: { experiment: EXPERIMENT_ID, side: body.side, termsVersion: '2026-10-06-points' },
      payment_intent_data: { metadata: { experiment: EXPERIMENT_ID, side: body.side, termsVersion: '2026-10-06-points' }, description: `WMI headline experiment: ${name}` },
      success_url: `${siteOrigin()}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin()}/?checkout=cancelled`,
      expires_at: checkoutRequest.expiresAtSeconds,
      custom_text: { submit: { message: 'Satire for entertainment. Each $1 buys 1 point. Starting scores are YES 1764 / NO 1763, not previous purchases. This buys points, not a guaranteed win or display time. All sales final and non-refundable except where required by law. No financial return or campaign donation.' } },
    }, { idempotencyKey: `${EXPERIMENT_ID}:${body.requestId}:${body.side}:${body.amountCents}` });
    await checkoutRequest.ref.set({ sessionId: session.id, sessionUrl: session.url }, { merge: true });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Headline checkout failed', error instanceof Error ? error.name : 'UnknownError');
    if (error && typeof error === 'object' && 'type' in error && error.type === 'StripeInvalidRequestError' && 'param' in error && typeof error.param === 'string' && /amount/.test(error.param)) {
      return NextResponse.json({ error: 'Stripe could not accept this amount. Try a smaller contribution or contact support.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Checkout is temporarily unavailable. No payment was taken here. Please try again.' }, { status: 503 });
  }
}
