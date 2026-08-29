# Security rules

- Authenticate server-side with `tokenIdentifier`; authorize membership and role before resource lookup.
- Test unauthenticated, foreign-workspace, insufficient-role, malformed-input, and replay cases with multiple identities.
- Never commit, log, return, or persist secrets.
