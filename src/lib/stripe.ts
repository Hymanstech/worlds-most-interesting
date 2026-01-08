// src/lib/stripe.ts
import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
  }

  if (!stripeInstance) {
    // Do NOT specify apiVersion — Stripe auto-detects the correct version.
    stripeInstance = new Stripe(secretKey);
  }

  return stripeInstance;
}
