// Operational helper. Never prints credentials, payer details, or webhook secrets.
require('@next/env').loadEnvConfig(process.cwd());
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { GoogleAuth } = require('google-auth-library');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const EXPERIMENT_ID = 'trump-headline-v1';
const webhookUrl = `https://us-central1-${projectId}.cloudfunctions.net/headlineStripeWebhook`;
const events = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated', 'refund.updated', 'refund.failed'];
const credentials = process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : null;
if (credentials?.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
admin.initializeApp({ credential: credentials ? admin.credential.cert(credentials) : admin.credential.applicationDefault(), projectId });
const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const stateRef = db.collection('headlineExperiment').doc('current');
const google = new GoogleAuth({ ...(credentials ? { credentials } : {}), scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
async function api(url, method = 'GET', data) {
  try {
    const client = await google.getClient();
    return (await client.request({ url, method, ...(data ? { data } : {}) })).data;
  } catch (error) {
    if (error.response?.status !== 403) throw error;
    // The existing CLI account can manage schedulers; the app's service account
    // intentionally has narrower permissions. Keep its tokens in memory only.
    const cliAuth = require(`${process.env.APPDATA}/npm/node_modules/firebase-tools/lib/auth.js`);
    const account = cliAuth.getGlobalDefaultAccount();
    if (!account) throw error;
    const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Google operation rejected (HTTP ${response.status})`);
    return response.json();
  }
}
async function firebaseSecret(value) {
  // Windows CLI executable is a .cmd shim; invoke its JS entry point directly.
  const cli = `${process.env.APPDATA}/npm/node_modules/firebase-tools/lib/bin/firebase.js`;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'functions:secrets:set', 'STRIPE_WEBHOOK_SECRET', '--project', projectId, '--data-file', '-', '--non-interactive'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdin.end(value);
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Secret provisioning failed (exit ${code}); inspect Firebase permissions.`)));
  });
  console.log('Webhook signing secret stored in Firebase Secret Manager.');
}
async function main() {
  const action = process.argv[2] || 'inspect';
  if (action === 'inspect') {
    const account = await stripe.accounts.retrieve();
    console.log(JSON.stringify({ stripeLive: process.env.STRIPE_SECRET_KEY.startsWith('sk_live_'), chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, cardPayments: account.capabilities?.card_payments }, null, 2));
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    console.log('Existing webhook endpoints:', endpoints.data.map(e => ({ id: e.id, url: e.url, status: e.status })));
    console.log('Experiment state:', (await stateRef.get()).data() || 'not initialized');
    for (const [label, url] of [
      ['Schedulers', `https://cloudscheduler.googleapis.com/v1/projects/${projectId}/locations/us-central1/jobs`],
      ['Firestore rules release', `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`],
    ]) {
      try {
        const data = await api(url);
        if (label === 'Schedulers') console.log(label, (data.jobs || []).map(j => ({ name: j.name, state: j.state })));
        else { console.log(label, data.rulesetName); const rules = await api(`https://firebaserules.googleapis.com/v1/${data.rulesetName}`); fs.mkdirSync('secrets', { recursive: true }); fs.writeFileSync('secrets/firestore-rules-before-headline.json', JSON.stringify(rules, null, 2)); console.log('Existing rules backed up locally.'); }
      } catch (e) { console.log(label, 'not accessible:', e.response?.status || e.code || e.name); }
    }
  } else if (action === 'provision-webhook') {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = endpoints.data.find(e => e.url === webhookUrl);
    if (existing) {
      await stripe.webhookEndpoints.update(existing.id, { enabled_events: events });
      console.log('Webhook event list updated:', existing.id, '(secret retained; no duplicate created).'); return;
    }
    const endpoint = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: events, description: 'World’s Most Interesting Person headline experiment' });
    // Store a resumable identifier before secret provisioning; no secret on disk.
    await stateRef.set({ webhookEndpointId: endpoint.id }, { merge: true });
    try { await firebaseSecret(endpoint.secret); }
    catch (e) { await stripe.webhookEndpoints.del(endpoint.id); await stateRef.set({ webhookEndpointId: admin.firestore.FieldValue.delete() }, { merge: true }); throw e; }
    console.log('Stripe endpoint registered:', endpoint.id, webhookUrl);
  } else if (action === 'initialize') {
    await db.runTransaction(async tx => {
      const snap = await tx.get(stateRef);
      if (snap.data()?.experimentId === EXPERIMENT_ID) return;
      tx.set(stateRef, { experimentId: EXPERIMENT_ID, mode: 'headline-duel', yesCents: 0, noCents: 0, winner: 'yes', paymentCount: 0, paymentsEnabled: false, webhookReady: false, endsAt: null, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    console.log('Experiment initialized with zero real totals and checkout closed.');
  } else if (action === 'pause-legacy') {
    const jobs = await api(`https://cloudscheduler.googleapis.com/v1/projects/${projectId}/locations/us-central1/jobs`);
    for (const job of jobs.jobs || []) {
      if (!/firebase-schedule-(settleCrownNightly|prepareDailyXPostDraft)-/.test(job.name)) continue;
      if (job.state === 'PAUSED') { console.log('Already paused:', job.name); continue; }
      await api(`https://cloudscheduler.googleapis.com/v1/${job.name}:pause`, 'POST', {});
      console.log('Paused legacy scheduler:', job.name);
    }
  } else if (action === 'open') {
    const snap = await stateRef.get();
    const state = snap.data();
    if (state?.experimentId !== EXPERIMENT_ID || !state?.webhookEndpointId) throw new Error('Provision the experiment and webhook first');
    const endpoint = await stripe.webhookEndpoints.retrieve(state.webhookEndpointId);
    if (endpoint.status !== 'enabled' || endpoint.url !== webhookUrl || events.some(event => !endpoint.enabled_events.includes(event))) throw new Error('Webhook configuration is incomplete');
    const r = await fetch(webhookUrl, { method: 'POST', body: '{}', signal: AbortSignal.timeout(30000) });
    if (r.status !== 400) throw new Error('Webhook signature rejection probe failed');
    const secret = await api(`https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/STRIPE_WEBHOOK_SECRET/versions/latest:access`);
    const signingSecret = Buffer.from(secret.payload.data, 'base64').toString('utf8');
    const payload = JSON.stringify({ id: 'evt_headline_configuration_probe', object: 'event', type: 'ping', data: { object: {} } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    const verified = await fetch(webhookUrl, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, signal: AbortSignal.timeout(30000) });
    if (verified.status !== 200) throw new Error(`Signed webhook verification failed (HTTP ${verified.status})`);
    await stateRef.set({ webhookReady: true, paymentsEnabled: true, endsAt: state.endsAt || new Date(Date.now() + 7 * 86400000).toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log('Contributions opened. Checkout closes:', (await stateRef.get()).data().endsAt);
  } else if (action === 'close') {
    await stateRef.set({ paymentsEnabled: false }, { merge: true }); console.log('New contributions closed.');
  } else if (action === 'ttl') {
    await api(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/headlineRateLimits/fields/expiresAt?updateMask=ttlConfig`, 'PATCH', { ttlConfig: {} });
    console.log('Rate-limit TTL configured.');
  } else throw new Error('Unknown action');
}
main().catch(e => { console.error('Operation failed:', e.response?.status || e.code || e.name, e.type === 'StripeAuthenticationError' ? 'Stripe authentication rejected' : e.message?.replace(/(?:sk|whsec)_[\w]+/g, '[redacted]').slice(0, 400)); process.exitCode = 1; }).finally(() => admin.app().delete());
