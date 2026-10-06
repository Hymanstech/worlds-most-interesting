// Verify public streaming with a harmless updatedAt write, never fake money.
require('@next/env').loadEnvConfig(process.cwd());
const admin = require('firebase-admin');
const assert = require('node:assert/strict');
const credentials = process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : null;
if (credentials?.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
admin.initializeApp({ credential: credentials ? admin.credential.cert(credentials) : admin.credential.applicationDefault(), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
const ref = admin.firestore().collection('headlineExperiment').doc('current');
const abort = new AbortController();
let reader;
async function main() {
  const timer = setTimeout(() => abort.abort(), 30000);
  try {
    const before = (await ref.get()).data();
    const response = await fetch('https://www.worldsmostinteresting.com/api/experiment/events', { signal: abort.signal });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith('text/event-stream'));
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    async function nextTotals() {
      for (;;) {
        const split = buffer.indexOf('\n\n');
        if (split >= 0) {
          const event = buffer.slice(0, split); buffer = buffer.slice(split + 2);
          const line = event.split('\n').find(item => item.startsWith('data: '));
          if (event.includes('event: totals') && line) return JSON.parse(line.slice(6));
          continue;
        }
        const chunk = await reader.read();
        assert.equal(chunk.done, false, 'Stream closed before an update');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
    const first = await nextTotals();
    for (const key of Object.keys(first)) assert.ok(['scoringMode', 'yesScoreCents', 'noScoreCents', 'yesStartingPoints', 'noStartingPoints', 'yesPaidCents', 'noPaidCents', 'yesCents', 'noCents', 'winner', 'yesStartingCreditCents', 'noMinimumToWinCents', 'paymentsOpen', 'endsAt', 'paymentCount'].includes(key), 'Only public fields may be streamed');
    const started = Date.now();
    await ref.update({ updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const next = await nextTotals();
    const latency = Date.now() - started;
    assert.ok(latency < 5000, `Stream update was delayed ${latency}ms`);
    const after = (await ref.get()).data();
    for (const key of ['yesCents', 'noCents', 'paymentCount', 'yesStartingCreditCents']) assert.equal(after[key], before[key], 'Verification must not change money or payment counts');
    assert.equal(next.yesCents, after.yesCents); assert.equal(next.noCents, after.noCents);
    console.log(`Live snapshot delivery verified in ${latency}ms after a timestamp-only write. Public money and payment counts unchanged.`);
  } finally { clearTimeout(timer); abort.abort(); if (reader) await reader.cancel().catch(() => {}); }
}
main().catch(error => { console.error('Live stream verification failed:', error.name, error.message?.slice(0, 300)); process.exitCode = 1; }).finally(() => admin.app().delete());
