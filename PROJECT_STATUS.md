# Project Status

Last updated: 2026-10-06 (paid headline experiment launch)

## Current State — Paid Headline Experiment

- Branch: main. Shipped implementation commit: 9a4d49a. Production: https://www.worldsmostinteresting.com.
- Replaced the daily crown homepage with KEEP THE CROWN / ADD THE NOT. Guest Stripe Checkout; no visitor accounts, profiles, uploads, or saved-card setup. Old public account pages redirect home; old payment, settlement, and admin APIs return HTTP 410.
- Confirmed paid USD totals control the headline, portrait/mugshot, and editorial bio. Initial YES/NO totals are real zeroes; a tie retains the incumbent.
- Charge-keyed Firestore transactions handle duplicate confirmations, partial/full refunds, pending/failed refunds, and disputes. Return-page confirmation and the signed Firebase webhook share the same reconciliation.
- Fixed checkout retry parameters: a request reserves one stable expiration, and retries reuse its saved session URL. One-time payments are $1–$500; no prizes, payouts, campaign donations, or recurring charges.
- Deployed headlineStripeWebhook and the legacy scheduler guards. Both legacy scheduler jobs are PAUSED. All browser Firestore reads/writes are denied; the admin UI uses server-verified Firebase tokens. Ephemeral rate-limit and checkout-request records have TTL enabled.
- Production guest checkout is open. New checkouts close Oct 13, 2026, 12:59 PM America/Chicago. The admin can pause checkout or change the closing time. Existing checkouts may complete within roughly half an hour.
- Validation: 14 automated accounting/security/retry tests, Next.js production build, and Functions build passed. Production pages/assets, legacy redirects/HTTP 410, unsigned admin rejection, webhook signature rejection/acceptance, and both unpaid live Checkout Session creation/retry/pending/expiration flows verified. No real money was charged by validation.
- /admin now shows the latest 50 confirmed payments, links to Stripe refunds, and checkout pause/end controls. Historical user records and original daily-crown source are retained; old saved cards are not charged.

### Remaining verification and privacy items

- Browser visual QA unavailable because no browser connection was available. The owner reviewed the first-pass visual mockup.
- A successful card charge/refund end-to-end test has not been performed. Optional retained-key sandbox validation was blocked by automatic approval review when application credentials lacked permission and broader CLI credentials would have been used; explicit owner approval and a fresh Firebase CLI sign-in are required.
- A Firebase CLI login listing unexpectedly printed saved OAuth credentials into tool output. The exposed CLI sign-in was revoked after launch checks; future Firebase deployments require a fresh sign-in. They were not added to source. Do not run JSON sign-in listings; firebase-safe.cjs suppresses CLI debug/API bodies.
- The existing GitHub repository is public and associates this project with its owner. Project branding on the website does not provide anonymity; repository visibility and checkout merchant identity still need owner consideration.
- Receiving-mailbox delivery for the existing support address was not tested. No emails or social posts were sent during this conversion.

### Next recommended steps

1. Monitor the Stripe dashboard and private ledger after the first real contribution; resolve support/refund requests there.
2. Use /admin to pause contributions or adjust the end time. Keep the retired nightly jobs paused.
3. Make the repository private if personal separation is important, and review the identity displayed by checkout/receipts.

## Legacy Daily Crown State (archived)

- Branch: `main`
- Latest shipped commit: `6543e43`
- Production build status: passing via `npm run build`
- Recent work completed:
  - Hardened payment routes so they use the authenticated Firebase user instead of trusting client-supplied identity.
  - Fixed account deactivation so it updates `isActive`, clears stored payment-method IDs, and resets `crownPrice` to `0`.
  - Replaced the default scaffold `README.md` with project-specific setup and operations notes.
  - Pushed fixes to `origin/main`.
  - Added a scheduled Firebase function that creates a daily X draft in `social_posts/x-YYYY-MM-DD` from the crowned user and photo.
  - Changed the X draft scheduler to run 30 minutes after the nightly crown award.
  - Added an admin-only manual rerun path for the X draft from the admin page.
  - Fixed the dashboard takeover price so it uses the live highest active bid from `queueEntries` and shows `$1` when there are no active bids.
  - Tightened the generated X draft copy and added manual Instagram draft generation from the admin page.
  - Expanded the admin social popup to support both X and Instagram draft review/copy workflows.

## Open Items

- Add an automated test suite for the highest-risk flows:
  - signup/login
  - payment setup and deactivation
  - nightly crown settlement
  - admin manual crown assignment
- Review and clean remaining user-facing text encoding issues on content pages.
- Confirm production Firebase rules and storage rules are appropriate for public launch.
- Verify production cron configuration for `/api/cron/settle-crown`.
- Verify the new morning scheduler for `prepareDailyXPostDraft`.
- Run a full staging checklist across signup, profile setup, payment, dashboard, admin, and nightly settlement.
- Decide whether to keep X posting manual from Firestore drafts or add full automatic posting to the X API.
- Decide whether admins should be able to preview/edit the generated X draft before posting.
- Decide whether to rename the shared admin route from `/api/admin/generate-x-post` to a more generic social-draft route.

## Known Risks

- No automated regression coverage yet.
- Some older routes and pages may still have polish issues even though the main launch blockers were fixed.
- Launch readiness still depends on correct production environment configuration for Stripe, Firebase Admin, Postmark, admin UIDs, and cron secret.
- The new X automation currently generates drafts, not live posts to X.
- The manual rerun path currently overwrites today's draft with the newest crown/profile data.
- Instagram drafts are manual-only right now; only X has a scheduled draft generator.

## Next Recommended Steps

1. Review the generated `social_posts` draft formats for both X and Instagram and confirm the copy style.
2. Add minimal smoke tests for auth, payment, crown settlement, and social draft generation.
3. Decide whether to add live X posting after draft generation.
4. Decide whether Instagram should also get a scheduled daily draft.

## Working Agreement

- This file is the running handoff log for Codex sessions in this repo.
- On meaningful changes, update:
  - `Last updated`
  - `Current State`
  - `Open Items`
  - `Next Recommended Steps`
