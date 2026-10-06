require('@next/env').loadEnvConfig(process.cwd());
const admin = require('firebase-admin');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { reconcileCharge } = require('../functions/lib/headline/ledger.js');
const credentials = process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : null;
if (credentials?.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
admin.initializeApp({ credential: credentials ? admin.credential.cert(credentials) : admin.credential.applicationDefault(), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
const db = admin.firestore();
const prefix = db.collection('headlineValidation').doc('sdk-' + randomUUID());
const isolated = { collection: name => prefix.collection(name), runTransaction: fn => db.runTransaction(fn) };
const stateRef = isolated.collection('headlineExperiment').doc('current');
const paymentRef = isolated.collection('headlinePayments').doc('ch_sdk_validation');
async function main() {
  await stateRef.set({ experimentId: 'trump-headline-v1', mode: 'headline-duel', yesCents: 0, noCents: 0, winner: 'yes', paymentCount: 0 });
  const charge = { metadata: { experiment: 'trump-headline-v1', side: 'yes' }, currency: 'usd', status: 'succeeded', paid: true, captured: true, amount_captured: 500, amount_refunded: 0, disputed: false, payment_intent: 'pi_sdk_validation', livemode: false, created: Math.floor(Date.now()/1000) };
  const provider = { charges: { retrieve: async () => charge }, refunds: { list: async function* () { yield { status: 'succeeded', amount: charge.amount_refunded }; } } };
  await Promise.all([reconcileCharge(isolated, provider, 'ch_sdk_validation'), reconcileCharge(isolated, provider, 'ch_sdk_validation')]);
  let state = (await stateRef.get()).data();
  assert.equal(state.yesCents, 500); assert.equal(state.paymentCount, 1);
  charge.amount_refunded = 500;
  await reconcileCharge(isolated, provider, 'ch_sdk_validation');
  state = (await stateRef.get()).data(); assert.equal(state.yesCents, 0);
  console.log('Real Firestore SDK integration passed: concurrent reconciliation, one counted record, and full reversal. Synthetic provider data, isolated records, no Stripe secret read, no public totals changed.');
}
main().catch(error => { console.error('SDK integration failed:', error.message.slice(0,350)); process.exitCode = 1; }).finally(async () => { await paymentRef.delete(); await stateRef.delete(); await admin.app().delete(); });
