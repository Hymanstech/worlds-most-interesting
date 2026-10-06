# Point scoring

YES starts at 1,764 points and NO at 1,763 points. These are disclosed game starting scores, not cash balances or previous purchases. Each confirmed USD dollar buys one point; cents buy fractional points. Points cannot be redeemed, transferred, or cashed out.

Real charge totals and paymentCount remain unchanged. yesCents retains its historical $1 operator credit for compatibility with the deployed webhook; paid YES money is yesCents minus yesStartingCreditCents. Public score units are hundredths of a point: YES = 176400 + paidYesCents; NO = 176300 + noCents. Their difference equals the old raw aggregate difference, so the existing webhook preserves correct winners and ties without a function redeployment. The old initial $2 NO floor applies only in legacy mode. In points mode a $1 NO purchase ties the starting scores, $1.01 takes the lead, and $3 gives NO a two-point lead. Refunds and disputes remove purchased points, never starting points.

The homepage, checkout, terms, and rules disclose starting scores and conversion. Administration separates real paid dollars from score totals. Metadata termsVersion is 2026-10-06-points.

Verified by 20 unit tests, Next and Functions builds, and isolated real-Firestore reconciliation covering duplicates, fractional takeovers, and reversals.
