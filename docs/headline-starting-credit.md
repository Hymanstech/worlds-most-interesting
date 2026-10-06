# Starting credit and winning-page previews

October 6, 2026 — headline-1.2

KEEP THE CROWN receives a one-time $1 operator starting credit. It is included in yesCents, identified separately by yesStartingCreditCents, and disclosed on the contribution card, admin page, and participation rules. It is never represented as a customer payment or ledger charge. The seed-crown operational action is transactional and idempotent; existing payments, counts, and checkout settings remain intact.

ADD THE NOT must reach at least $2 and exceed the YES total. Cent amounts and $1 contributions remain allowed. Above this floor, equal totals preserve the incumbent. Refunds or disputes dropping NO below the floor restore YES. readState projects the winning side from the current totals and starting-credit marker, including historical winner values written by the deployed webhook. Both the homepage and metadata use this projection. The shared ledger source also writes the same result for future function deployments. The existing deployed webhook can keep aggregating captured/refunded cents without any schema migration; its raw winner field is not authoritative below the floor.

Each contribution card and the checkout dialog offer a winning-page preview. Preview mode changes the headline, portrait/mugshot, and editorial bio locally, displays a persistent preview notice, and offers a return to the live page. Live totals, takeover estimates, checkout selection, and copied share text continue to use the actual result.

Validation: 16 accounting/security tests, Next production build, Functions TypeScript build, and isolated real-Firestore integration covering duplicate reconciliation, starting-credit preservation, the exact $2 floor, and refund reversals. Browser runtime reports no connected browsers; interactive visual verification is unavailable.
