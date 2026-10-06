const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => dependencies[name] || require(name), Date, console, TextEncoder, ReadableStream, Response, setInterval, clearInterval, setTimeout, clearTimeout });
  return module.exports;
}
const core = load('functions/src/headline/core.ts');
const ledger = load('functions/src/headline/ledger.ts', { './core': core });
function fixture() {
  const documents = new Map([['headlineExperiment/current', { experimentId: core.EXPERIMENT_ID, mode: 'headline-duel', yesCents: 0, noCents: 0, winner: 'yes', paymentCount: 0 }]]);
  let queue = Promise.resolve();
  const db = { collection: name => ({ doc: id => ({ path: name + '/' + id }) }), runTransaction: callback => {
    const operation = queue.then(async () => {
      const pending = new Map();
      const result = await callback({ get: async ref => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) }), set: (ref, data) => pending.set(ref.path, { ...documents.get(ref.path), ...data }) });
      for (const [key, data] of pending) documents.set(key, data);
      return result;
    }); queue = operation.catch(() => {}); return operation;
  } };
  const charge = { id: 'ch_one', metadata: { experiment: core.EXPERIMENT_ID, side: 'yes' }, paid: true, captured: true, status: 'succeeded', currency: 'usd', amount_captured: 500, amount_refunded: 0, disputed: false, payment_intent: 'pi_one', livemode: false };
  let dispute = 'under_review';
  let refunds = null;
  const session = { id: 'cs_test_example', metadata: charge.metadata, status: 'complete', payment_status: 'paid', amount_total: 500, payment_intent: 'pi_one' };
  const stripe = { charges: { retrieve: async () => ({ ...charge, metadata: { ...charge.metadata } }) }, refunds: { list: async function* () { for (const refund of refunds || [{ status: 'succeeded', amount: charge.amount_refunded }]) yield refund; } }, disputes: { list: async () => ({ data: [{ status: dispute }] }) }, checkout: { sessions: { retrieve: async () => session } }, paymentIntents: { retrieve: async () => ({ status: 'succeeded', metadata: charge.metadata, latest_charge: charge.id }) } };
  return { db, stripe, charge, session, documents, state: () => documents.get('headlineExperiment/current'), setDispute: value => { dispute = value; }, setRefunds: value => { refunds = value; } };
}
test('amount validation permits thousands and larger payments but rejects invalid cent values', () => {
  for (const amount of [0, -1, 99, Number.MAX_SAFE_INTEGER + 1, 100.1, Infinity, NaN, '500']) assert.equal(core.validAmount(amount), false);
  for (const amount of [100, 500, 50000, 50001, 1000000, 999999999999]) assert.equal(core.validAmount(amount), true);
  assert.equal(core.isSide('yes'), true); assert.equal(core.isSide('YES'), false);
});

test('USD parsing retains cents exactly for large contributions and rejects unsafe or malformed amounts', () => {
  for (const [input, expected] of [['1000', 100000], ['10000.99', 1000099], ['9999999999.99', 999999999999], ['1.01', 101], ['0001.1', 110]]) assert.equal(core.parseUsdAmount(input), expected);
  for (const input of ['1.001', '-1', 'NaN', '1e6', '900719925474099.99']) assert.equal(core.parseUsdAmount(input), null);
});

test('live stream publishes changing public totals and unsubscribes on cancellation without leaking private fields', async () => {
  let next, unsubscribed = 0;
  const f = fixture();
  const server = load('src/lib/experimentServer.ts', { '@/lib/firebaseAdmin': { adminDb: f.db }, '@/lib/experiment': core });
  const events = load('src/app/api/experiment/events/route.ts', {
    '@/lib/firebaseAdmin': { adminDb: { collection: () => ({ doc: () => ({ onSnapshot: callback => { next = callback; return () => unsubscribed++; } }) }) } },
    '@/lib/experiment': core, '@/lib/experimentServer': server,
  });
  const response = await events.GET(new Request('http://localhost/api/experiment/events'));
  assert.ok(response.headers.get('content-type').startsWith('text/event-stream'));
  const reader = response.body.getReader(); await reader.read();
  next({ data: () => ({ yesCents: 100, noCents: 0, yesStartingCreditCents: 100, customerEmail: 'private@example.invalid' }) });
  let text = new TextDecoder().decode((await reader.read()).value);
  assert.ok(text.includes('"winner":"yes"')); assert.ok(!text.includes('customerEmail'));
  next({ data: () => ({ yesCents: 100, noCents: 200, yesStartingCreditCents: 100 }) });
  text = new TextDecoder().decode((await reader.read()).value); assert.ok(text.includes('"winner":"no"'));
  await reader.cancel(); assert.equal(unsubscribed, 1);
});
test('ties preserve the incumbent including a NO incumbent', () => { assert.equal(core.winningSide(500, 500, 'no'), 'no'); assert.equal(core.winningSide(0, 0), 'yes'); });

test('starting points are separate from payments; $1 ties, $1.01 overtakes, and $3 buys three points', () => {
  const raw = { scoringMode: 'points', yesStartingPoints: 1764, noStartingPoints: 1763, yesStartingCreditCents: 100, yesCents: 100, noCents: 0, winner: 'yes' };
  const state = core.readState(raw);
  assert.equal(state.yesScoreCents, 176400); assert.equal(state.noScoreCents, 176300); assert.equal(state.paymentCount, 0);
  assert.equal(core.readState({ ...raw, noCents: 100 }).winner, 'yes');
  assert.equal(core.readState({ ...raw, noCents: 101 }).winner, 'no');
  assert.equal(core.readState({ ...raw, noCents: 300 }).noScoreCents, 176600);
  for (const yes of [0, 100, 101, 99999]) for (const no of [0, 100, 101, 99999]) for (const incumbent of ['yes', 'no']) {
    const nativeWinner = core.winningSide(yes + 100, no, incumbent);
    assert.equal(core.readState({ ...raw, yesCents: yes + 100, noCents: no, winner: incumbent }).winner, nativeWinner, 'Compatible with deployed webhook ties and winners');
  }
});

test('points accounting preserves starting scores through purchases, duplicates, ties, and refunds', async () => {
  const f = fixture(); Object.assign(f.state(), { scoringMode: 'points', yesStartingPoints: 1764, noStartingPoints: 1763, yesStartingCreditCents: 100, yesCents: 100 });
  f.charge.metadata.side = 'no'; f.charge.amount_captured = 300;
  await ledger.reconcileCharge(f.db, f.stripe, 'ch_points'); await ledger.reconcileCharge(f.db, f.stripe, 'ch_points');
  assert.equal(core.readState(f.state()).noScoreCents, 176600); assert.equal(f.state().paymentCount, 1); assert.equal(f.state().noCents, 300);
  f.charge.amount_refunded = 300; await ledger.reconcileCharge(f.db, f.stripe, 'ch_points');
  assert.equal(core.readState(f.state()).noScoreCents, 176300); assert.equal(core.readState(f.state()).yesScoreCents, 176400); assert.equal(f.state().winner, 'yes');
});

test('the disclosed $1 credit requires NO to reach $2, including fractional totals and old webhook winner values', () => {
  for (const noCents of [0, 100, 101, 199]) {
    assert.equal(core.readState({ yesCents: 100, noCents, yesStartingCreditCents: 100, winner: 'no' }).winner, 'yes');
  }
  assert.equal(core.readState({ yesCents: 100, noCents: 200, yesStartingCreditCents: 100 }).winner, 'no');
  assert.equal(core.readState({ yesCents: 200, noCents: 200, yesStartingCreditCents: 100, winner: 'no' }).winner, 'no');
  assert.equal(core.readState({ yesCents: 200, noCents: 200, yesStartingCreditCents: 100, winner: 'yes' }).winner, 'yes');
  assert.equal(core.readState({ yesCents: 300, noCents: 200, yesStartingCreditCents: 100, winner: 'no' }).winner, 'yes');
});

test('two $1 NO contributions win; refunds restore YES without removing its starting credit or inventing a payment', async () => {
  const f = fixture(); Object.assign(f.state(), { yesCents: 100, yesStartingCreditCents: 100 });
  f.charge.metadata.side = 'no'; f.charge.amount_captured = 100;
  await ledger.reconcileCharge(f.db, f.stripe, 'ch_first');
  assert.equal(f.state().winner, 'yes'); assert.equal(f.state().paymentCount, 1);
  f.charge.id = 'ch_second'; await ledger.reconcileCharge(f.db, f.stripe, 'ch_second');
  assert.equal(f.state().winner, 'no'); assert.equal(f.state().noCents, 200); assert.equal(f.state().paymentCount, 2);
  f.charge.amount_refunded = 100; await ledger.reconcileCharge(f.db, f.stripe, 'ch_second');
  assert.equal(f.state().winner, 'yes'); assert.equal(f.state().yesCents, 100); assert.equal(f.state().noCents, 100);
  assert.equal(f.state().yesStartingCreditCents, 100); assert.equal(f.state().paymentCount, 2);
});
test('checkout remains closed until enabled, webhook-ready, and before end time', () => {
  const state = core.readState({ paymentsEnabled: true, webhookReady: true, endsAt: '2026-10-07T00:00:00Z' });
  assert.equal(core.isOpen(state, Date.parse('2026-10-06T00:00:00Z')), true);
  assert.equal(core.isOpen(state, Date.parse(state.endsAt)), false);
  assert.equal(core.isOpen({ ...state, webhookReady: false }), false);
});
test('parallel return-page and webhook fulfillment count a charge only once', async () => {
  const f = fixture();
  await Promise.all([ledger.reconcileSession(f.db, f.stripe, f.session.id), ledger.reconcileCharge(f.db, f.stripe, f.charge.id), ledger.reconcileCharge(f.db, f.stripe, f.charge.id)]);
  assert.equal(f.state().yesCents, 500); assert.equal(f.state().paymentCount, 1);
});
test('unpaid checkout contributes nothing', async () => { const f = fixture(); f.session.payment_status = 'unpaid'; await ledger.reconcileSession(f.db, f.stripe, f.session.id); assert.equal(f.state().yesCents, 0); });
test('refunds arriving before checkout completion never inflate totals', async () => {
  const f = fixture(); f.charge.amount_refunded = 500;
  await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); await ledger.reconcileSession(f.db, f.stripe, f.session.id);
  assert.equal(f.state().yesCents, 0); assert.equal(f.state().paymentCount, 1);
});
test('partial refunds subtract once and cannot be undone by a stale refund amount', async () => {
  const f = fixture(); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id);
  f.charge.amount_refunded = 200; await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id);
  assert.equal(f.state().yesCents, 300);
  f.setRefunds([{ status: 'succeeded', amount: 200 }]); f.charge.amount_refunded = 0; await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 300);
});
test('pending refunds do not reduce totals; succeeded refunds do, and failed refunds are restored', async () => {
  const f = fixture(); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id);
  f.charge.amount_refunded = 200; f.setRefunds([{ status: 'pending', amount: 200 }]); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 500);
  f.setRefunds([{ status: 'succeeded', amount: 200 }]); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 300);
  f.charge.amount_refunded = 0; f.setRefunds([{ status: 'failed', amount: 200 }]); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 500);
});
test('disputed money is excluded, restored on a win, and respects refunds', async () => {
  const f = fixture(); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id);
  f.charge.disputed = true; await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 0);
  f.setDispute('won'); f.charge.amount_refunded = 100; await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 400);
  f.setDispute('lost'); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); assert.equal(f.state().yesCents, 0);
});
test('NO takes the lead, a tie retains NO, then one cent flips it back', async () => {
  const f = fixture(); f.charge.metadata.side = 'no'; await ledger.reconcileCharge(f.db, f.stripe, 'ch_no'); assert.equal(f.state().winner, 'no');
  f.charge.metadata.side = 'yes'; f.charge.id = 'ch_yes'; await ledger.reconcileCharge(f.db, f.stripe, 'ch_yes'); assert.equal(f.state().winner, 'no');
  f.charge.id = 'ch_penny'; f.charge.amount_captured = 1; await ledger.reconcileCharge(f.db, f.stripe, 'ch_penny'); assert.equal(f.state().winner, 'yes');
});
test('unrelated payments, uncaptured funds, and other currencies are ignored', async () => {
  for (const change of [{ metadata: { experiment: 'other', side: 'yes' } }, { captured: false }, { currency: 'eur' }, { metadata: { experiment: core.EXPERIMENT_ID, side: 'invalid' } }]) {
    const f = fixture(); Object.assign(f.charge, change); assert.equal(await ledger.reconcileCharge(f.db, f.stripe, f.charge.id), null); assert.equal(f.state().paymentCount, 0);
  }
});
test('recorded payment side is immutable', async () => {
  const f = fixture(); await ledger.reconcileCharge(f.db, f.stripe, f.charge.id); f.charge.metadata.side = 'no';
  await assert.rejects(ledger.reconcileCharge(f.db, f.stripe, f.charge.id)); assert.equal(f.state().yesCents, 500);
});
test('webhook signatures reject tampered requests', () => {
  const Stripe = require('stripe'); const stripe = new Stripe('sk_test_fake');
  const secret = 'whsec_unit_test'; const payload = JSON.stringify({ id: 'evt_fake', type: 'checkout.session.completed' });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, 'evt_fake');
  assert.throws(() => stripe.webhooks.constructEvent(payload + ' ', header, secret));
});
test('checkout retries on another server retain the original expiry and reuse the saved URL', async () => {
  const f = fixture();
  const server = load('src/lib/experimentServer.ts', { '@/lib/firebaseAdmin': { adminDb: f.db, adminAuth: {}, adminFieldValue: { serverTimestamp: () => 'timestamp' } }, '@/lib/experiment': core });
  const first = await server.reserveCheckoutRequest('yes', 500, 'request-one', 1000000);
  const retry = await server.reserveCheckoutRequest('yes', 500, 'request-one', 1010000);
  assert.equal(first.expiresAtSeconds, retry.expiresAtSeconds);
  f.documents.set(first.ref.path, { ...f.documents.get(first.ref.path), sessionUrl: 'https://checkout.stripe.com/c/pay/cs_example' });
  const cached = await server.reserveCheckoutRequest('yes', 500, 'request-one', 1020000);
  assert.equal(cached.sessionUrl, 'https://checkout.stripe.com/c/pay/cs_example');
  const otherSide = await server.reserveCheckoutRequest('no', 500, 'request-one', 1030000);
  assert.notEqual(first.ref.path, otherSide.ref.path);
});
