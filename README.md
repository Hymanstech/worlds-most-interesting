## World's Most Interesting

Paid daily crown game built with Next.js, Firebase, and Stripe. Users create a profile, set a daily Crown Price, authorize a payment method, and compete to be featured on the homepage. Admin tooling supports moderation and manual crown assignment, and a cron route settles the nightly winner.

## Stack

- Next.js App Router
- Firebase Auth, Firestore, and Storage
- Firebase Admin SDK for server routes
- Stripe SetupIntents and off-session PaymentIntents
- Optional Postmark password reset email delivery

## Local Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
```

## Required Environment Variables

Client:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL`

Server:

- `STRIPE_SECRET_KEY`
- `FIREBASE_ADMIN_JSON` or equivalent Google application default credentials
- `ADMIN_UIDS`
- `CRON_SECRET`
- `APP_URL` for password reset links
- `POSTMARK_SERVER_TOKEN` if password reset email delivery is enabled

## Core Flows

- `/signup`: creates or resumes an account, stores legal acceptance, then routes to profile setup.
- `/setup/profile`: sets bio, photo, and Crown Price.
- `/setup/payment`: creates a Stripe SetupIntent and stores the default payment method.
- `/dashboard`: lets users update price, manage card state, and view queue position.
- `/admin`: admin-only operations page for user edits, crown status review, and manual assignment.

## Operations

- Nightly settlement runs through `POST /api/cron/settle-crown` with header `x-cron-secret: <CRON_SECRET>`.
- Settlement charges the top eligible active user, updates `crownStatus/current`, and records the active winner snapshot.
- X draft generation runs via the Firebase scheduled function `prepareDailyXPostDraft` at `12:35 AM` America/Chicago and writes a draft document to `social_posts/x-YYYY-MM-DD`.
- Admins can regenerate today's X draft on demand through `POST /api/admin/generate-x-post` or from the admin UI button.
- Admin access is controlled by Firebase custom claim `admin: true` or by `ADMIN_UIDS`.
- Payment routes are expected to be called with a Firebase ID token in the `Authorization: Bearer <token>` header.

## Launch Checklist

- Configure all environment variables in the deployment target.
- Confirm Firebase Auth, Firestore, and Storage rules are correct for production.
- Ensure the nightly cron job is configured and sending `x-cron-secret`.
- Seed at least one admin UID.
- Run a production build before deploy.
- Exercise signup, profile setup, payment setup, dashboard update, admin assign, and nightly settlement in a staging environment.

## Current Gaps

- There is not yet an automated test suite for the payment and crown-settlement flows.
- Linting may require a shell environment where `npm` is available on PATH.
