// Real production session creation/expiration, without entering card details
// or taking a payment. Never prints session URLs, credentials, or payer data.
require('@next/env').loadEnvConfig(process.cwd());
const Stripe = require('stripe');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const base = 'https://www.worldsmostinteresting.com';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
async function json(response, stage) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${stage}: HTTP ${response.status}, non-JSON response (${response.headers.get('content-type') || 'unknown type'}).`); }
}
async function main() {
  const before = await json(await fetch(`${base}/api/experiment`, { cache: 'no-store' }), 'Initial totals');
  assert.equal(before.paymentsOpen, true);
  for (const side of ['yes', 'no']) {
    const body = { side, amountCents: 100, acceptedTerms: true, requestId: randomUUID() };
    const create = () => fetch(`${base}/api/checkout`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const response = await create();
    const data = await json(response, `${side} checkout creation`);
    assert.equal(response.status, 200, data.error || 'Checkout creation failed');
    const sessionId = new URL(data.url).pathname.match(/\/(cs_live_[a-zA-Z0-9]+)/)?.[1];
    assert.ok(sessionId, 'Expected a live hosted-checkout session');
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      assert.equal(session.mode, 'payment'); assert.equal(session.currency, 'usd'); assert.equal(session.amount_total, 100);
      assert.equal(session.metadata.experiment, 'trump-headline-v1'); assert.equal(session.metadata.side, side);
      assert.equal(session.payment_status, 'unpaid'); assert.equal(session.livemode, true);
      const repeated = await json(await create(), `${side} checkout retry`); assert.equal(repeated.url, data.url, 'Retries must reuse the checkout');
      const pending = await json(await fetch(`${base}/api/checkout/status?session_id=${sessionId}`, { cache: 'no-store' }), `${side} pending status`);
      assert.equal(pending.status, 'pending');
      console.log(`${side.toUpperCase()}: live guest checkout, correct amount/metadata, idempotent retry, unpaid checkout not counted.`);
    } finally { await stripe.checkout.sessions.expire(sessionId); }
    const expired = await json(await fetch(`${base}/api/checkout/status?session_id=${sessionId}`, { cache: 'no-store' }), `${side} expired status`);
    assert.equal(expired.status, 'expired');
  }
  const after = await json(await fetch(`${base}/api/experiment`, { cache: 'no-store' }), 'Final totals');
  assert.equal(after.yesCents, before.yesCents); assert.equal(after.noCents, before.noCents); assert.equal(after.paymentCount, before.paymentCount);
  console.log('Both validation sessions expired. Public totals unchanged. No card details entered or real money charged.');
}
main().catch(error => { console.error('Launch verification failed:', error.message?.replace(/(?:sk|whsec)_[\w]+/g, '[redacted]').slice(0, 300)); process.exitCode = 1; });
