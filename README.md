# World’s Most Interesting Person

A guest-checkout headline experiment built with Next.js, Firebase, and Stripe. KEEP THE CROWN (YES) and ADD THE NOT (NO) fund two alternate homepage treatments. The higher point score controls the headline, image, and bio. Each confirmed USD dollar buys one point; disclosed starting scores are YES 1,764 / NO 1,763. Ties retain the incumbent; the initial incumbent is YES.

## Development

Install root and Functions dependencies with npm ci and npm --prefix functions ci. Run npm run dev. Validate with npm test, npm run build, and npm --prefix functions run build.

## Payment flow

POST /api/checkout creates a hosted Stripe Checkout Session for a one-time USD payment of at least $1. No visitor authentication, card storage, or off-session charging. Server-side validation, origin checks, a shared Firestore rate limit, and Stripe idempotency keys protect session creation.

The Firebase headlineStripeWebhook verifies the raw-body signature, retrieves current Stripe payment state, and reconciles a charge-keyed Firestore ledger in a transaction. The return-page /api/checkout/status endpoint uses the same reconciliation. Duplicate confirmations cannot add money twice. Refunds subtract credited amounts; open/lost disputes are excluded and won disputes restore eligible amounts.

## Configuration

The existing server STRIPE_SECRET_KEY, Firebase Admin credentials (FIREBASE_ADMIN_JSON or Google application credentials), and ADMIN_UIDS are required. NEXT_PUBLIC_FIREBASE_* is only needed for administrator sign-in. APP_URL or NEXT_PUBLIC_SITE_URL sets the canonical site origin; production defaults to https://www.worldsmostinteresting.com.

The webhook signing secret belongs in Firebase Secret Manager as STRIPE_WEBHOOK_SECRET, alongside the existing STRIPE_SECRET_KEY. It does not need to be added to DigitalOcean. Use scripts/experiment-ops.cjs inspect, initialize, provision-webhook, pause-legacy, ttl, open, or close for operational tasks. These commands require authorized network access and existing Firebase/Stripe credentials. Never print credential objects. The open command requires a deployed signature-verifying webhook and sets a seven-day closing time if none exists.

## Operations

/admin uses the existing administrator Firebase account. It displays the latest 50 payments, links to Stripe for refunds, and lets the administrator pause checkout or change its closing time. Totals are not editable. Previously opened checkouts can complete within roughly half an hour after a pause or closing time. Refunds/disputes can still change the result afterward.

Firestore collections: headlineExperiment/current (settings and aggregate totals), headlinePayments/{chargeId} (private ledger), headlineRateLimits/{hash} (abuse limits), and headlineCheckoutRequests/{requestKey} (stable checkout expiry and session URL for retries). Both ephemeral collections use expiresAt TTL. All browser Firestore reads/writes are denied. Public totals are served by /api/experiment; admin routes verify Firebase tokens and admin claims/UIDs on the server.

## Deployment

The existing DigitalOcean app builds origin/main automatically. The webhook and legacy scheduler guards deploy separately with Firebase. scripts/firebase-safe.cjs filters CLI debug output; use it instead of JSON sign-in listings. Confirm deployment and webhook operation before opening contributions.

Legacy daily-crown source and historical user records are retained. The Next.js proxy redirects old account/profile pages and returns HTTP 410 for retired payment/settlement/admin endpoints. Legacy Cloud Scheduler jobs must remain paused; the new function guards also refuse to run while headline-duel mode is active. No existing saved cards are charged.

The standalone first-pass mockup remains under public/mockup and is explicitly demo-only. Starting points are separate from actual paid dollars. Scores begin at YES 1,764 / NO 1,763; $1 buys one additional point. The old $1 credit remains only in internal aggregate accounting for webhook compatibility and is excluded from paid revenue. See docs/points-scoring.md. Public updates stream through /api/experiment/events, with a one-second polling fallback during connection interruptions.
