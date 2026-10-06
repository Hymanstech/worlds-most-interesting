import type Stripe from 'stripe';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { countedAmount, EXPERIMENT_ID, isSide, readState, winningSide } from './core';

// A charge is the unique accounting key. Both webhooks and the return page can
// reconcile it safely, including refunds/disputes delivered before completion.
export async function reconcileCharge(db: Firestore, stripe: Stripe, chargeId: string) {
  const ref = db.collection('headlinePayments').doc(chargeId);
  const stateRef = db.collection('headlineExperiment').doc('current');
  return db.runTransaction(async (tx) => {
    const paymentSnap = await tx.get(ref);
    const stateSnap = await tx.get(stateRef);
    // Retrieve inside the transaction: concurrent reconciliation retries fetch
    // current Stripe state instead of committing an older network snapshot.
    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.metadata.experiment !== EXPERIMENT_ID || !isSide(charge.metadata.side) ||
        charge.currency !== 'usd' || !charge.paid || !charge.captured || charge.status !== 'succeeded') return null;
    const state = readState(stateSnap.data());
    if (!stateSnap.exists || state.experimentId !== EXPERIMENT_ID) throw new Error('Experiment is not initialized');
    const previous = paymentSnap.data() || {};
    if (paymentSnap.exists && previous.side !== charge.metadata.side) throw new Error('Payment side cannot change');
    let disputeStatus: string | undefined;
    if (charge.disputed) {
      const disputes = await stripe.disputes.list({ charge: chargeId, limit: 1 });
      // If a disputed charge cannot be resolved, exclude it until reconciliation.
      disputeStatus = disputes.data[0]?.status || 'under_review';
    }
    let refundedCents = 0;
    if (charge.amount_refunded > 0 || Number(previous.refundedCents) > 0) {
      // A refund can be pending or subsequently fail. Count only succeeded
      // refunds from the current Stripe record, not the webhook's old snapshot.
      for await (const refund of stripe.refunds.list({ charge: chargeId, limit: 100 })) {
        if (refund.status === 'succeeded') refundedCents += refund.amount;
      }
    }
    const effectiveCents = countedAmount(charge.amount_captured, refundedCents, disputeStatus);
    const oldCents = Number(previous.countedCents) || 0;
    const delta = effectiveCents - oldCents;
    const side = charge.metadata.side;
    const yesCents = state.yesCents + (side === 'yes' ? delta : 0);
    const noCents = state.noCents + (side === 'no' ? delta : 0);
    if (!Number.isSafeInteger(yesCents) || !Number.isSafeInteger(noCents) || yesCents < 0 || noCents < 0) {
      throw new Error('Ledger total invariant failed');
    }
    const winner = winningSide(yesCents, noCents, state.winner);
    if (!paymentSnap.exists || delta !== 0 || previous.disputeStatus !== (disputeStatus || null) || previous.refundedCents !== refundedCents) {
      tx.set(ref, {
        chargeId, side, amountCents: charge.amount_captured, refundedCents,
        countedCents: effectiveCents, disputeStatus: disputeStatus || null,
        paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || null,
        livemode: charge.livemode, createdAt: previous.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(stateRef, {
        yesCents, noCents, winner,
        paymentCount: state.paymentCount + (paymentSnap.exists ? 0 : 1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { side, amountCents: charge.amount_captured, countedCents: effectiveCents, winner };
  });
}

export async function reconcileSession(db: Firestore, stripe: Stripe, sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.experiment !== EXPERIMENT_ID || !isSide(session.metadata.side)) return null;
  if (session.payment_status !== 'paid' || session.status !== 'complete') {
    return { status: session.status === 'expired' ? 'expired' : 'pending', side: session.metadata.side, amountCents: session.amount_total || 0 };
  }
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!piId) throw new Error('Paid checkout has no payment intent');
  const intent = await stripe.paymentIntents.retrieve(piId);
  const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
  if (intent.status !== 'succeeded' || !chargeId || intent.metadata.experiment !== EXPERIMENT_ID || intent.metadata.side !== session.metadata.side) {
    throw new Error('Payment could not be verified');
  }
  const result = await reconcileCharge(db, stripe, chargeId);
  if (!result) throw new Error('Payment could not be counted');
  return { status: result.countedCents > 0 ? 'paid' : 'reversed', ...result };
}

export const WEBHOOK_EVENTS = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated',
  'charge.dispute.closed', 'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
  'refund.updated', 'refund.failed',
] as const;

export async function handleExperimentEvent(db: Firestore, stripe: Stripe, event: Stripe.Event) {
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await reconcileSession(db, stripe, (event.data.object as Stripe.Checkout.Session).id);
  } else if (event.type === 'charge.refunded') {
    await reconcileCharge(db, stripe, (event.data.object as Stripe.Charge).id);
  } else if (event.type === 'refund.updated' || event.type === 'refund.failed') {
    const refund = event.data.object as Stripe.Refund;
    const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
    if (chargeId) await reconcileCharge(db, stripe, chargeId);
  } else if (event.type.startsWith('charge.dispute.')) {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
    await reconcileCharge(db, stripe, chargeId);
  }
}
