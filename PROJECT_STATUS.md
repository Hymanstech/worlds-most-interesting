# Project Status

Last updated: 2026-03-11 14:48:36 -05:00

## Current State

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
