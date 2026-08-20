# Field Desk — rep.qualifiedcommercial.com

The console for Qualified Commercial field reps: they visit a business, open a
file on site, request bank statements or a credit authorisation, and work the
file through to a decision.

A file here **is** a Capital OS client file (`DealerBusiness`), so it gets the
whole metrics engine — coverage, average daily balance, liquidity, score,
capital paths — rather than a second, weaker analysis. A `dos_rep_leads` row
carries ownership and pipeline state on top of it.

## Access

Two roles reach this app:

- `field_rep` — sees only files they own (`DealerBusiness.owner_user_id`).
- `super_admin` / `loan_exec` — see every rep's files, and production.

Scoping is enforced entirely server-side by `resolve_dealer_scope` and the
single list filter on `GET /dealer-os/dealers`. Nothing in this repo is a
security boundary.

## Design

`src/app/globals.css` is vendored verbatim from QCDealerOS so this app and
`audit.qualifiedcommercial.com` read as one product. Keep them in step.

## Local

    pnpm install
    cp .env.example .env.local   # fill from the Amplify console
    pnpm dev                     # port 3003

Ports in use: QCDashboard 3000, QCWeb 3001, QCDealerOS 3002, this 3003.

## Deploy

Amplify SSR, branch `main`, auto-build on push. `amplify.yml` writes
`.env.production` at build time — if a build log shows `✗ MISSING`, the app will
503 at runtime rather than fail the build.
