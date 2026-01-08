// src/lib/stripe.ts
import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
  }

  stripeInstance = new Stripe(secretKey, {
    /**
     * IMPORTANT:
     * Stripe hard-types apiVersion in their SDK.
     * Locking it here (with `as any`) prevents future build failures
     * when Stripe updates their type definitions.
     */
    apiVersion: "2025-11-17.clover" as any,
  });

  return stripeInstance;
}
