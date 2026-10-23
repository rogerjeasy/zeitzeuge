# `auth`

Cognito user pool, groups mapped to archive roles, and the guest demo path.

## Resources

- User pool (**Plus** tier: threat protection ENFORCED, V2 pre-token trigger), email
  sign-in, case-insensitive, deletion protection, optional TOTP MFA
- Password policy 8+ / upper / lower / digit / symbol, history 5 — identical to
  `schemas/password.py` and `lib/auth/password.ts`
- Custom attributes `tenant_id`, `role` — **not writable by users** (the client's
  `write_attributes` exclude them; only the API's admin calls set them)
- Groups `admin · archivist · reviewer · operator · reader · guest` (UserRole)
- `web` client: confidential, `ALLOW_ADMIN_USER_PASSWORD_AUTH` +
  `ALLOW_REFRESH_TOKEN_AUTH`, no user-existence errors, token revocation
- `harvester` client: `client_credentials`, scope `harvest.read`, via the pool domain
- Pre-token Lambda (`lambda/pre_token.py`): copies `tenant_id` and `role` into
  the access token
- Secrets `zeitzeuge/prod/cognito/{web,guest,harvester}` — the API reads them
  by reference; the guest *user* is created by `scripts/seed_demo.py`

Email goes through Cognito's sender (50/day). Enough for the demo — the guest
path sends none — but move to SES before real onboarding.

## Notes

The tenant_id claim in the JWT is what the API turns into a Postgres `SET LOCAL app.tenant_id` for RLS. That chain — Cognito claim to RLS predicate — is the tenant-isolation argument; without the pre-token hook there is nothing to enforce.
