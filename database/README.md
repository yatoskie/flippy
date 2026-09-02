# Flippy — Database layer

Standard MySQL, no vendor lock-in. This schema runs unmodified on Vercel-hosted
MySQL (for testing now) and Hostinger MySQL (for later) — the only thing that
changes between them is connection credentials.

## Set up on Vercel (now)

1. Provision a MySQL database (e.g. a Vercel-compatible MySQL add-on, or any
   external MySQL host reachable from Vercel — PlanetScale, Railway, etc. all
   speak standard MySQL wire protocol).
2. Run `schema.sql` once against it:
   ```bash
   mysql -h <host> -u <user> -p <database> < schema.sql
   ```
3. Set the connection details as environment variables in your Vercel project
   (Project → Settings → Environment Variables) — see `.env.example` at the
   repo root for the exact variable names. The API layer (`api/_lib/db.py`)
   reads only from these variable names, nowhere else.

## Migrate to Hostinger (later)

1. Create a MySQL database in Hostinger's hPanel.
2. Run the same `schema.sql` against it — it's standard SQL, nothing to edit.
3. If you have existing data to bring over: `mysqldump` the Vercel-hosted
   database and import the dump into Hostinger.
4. Update the environment variables (same names — `DB_HOST`, `DB_PORT`,
   `DB_USER`, `DB_PASSWORD`, `DB_NAME`) to point at Hostinger's credentials,
   wherever you're running the API from at that point.
5. No code or schema changes required — that's the entire migration.

## Design notes

- `password_hash` stores `salt_hex$hash_hex` from PBKDF2-SHA256 (see
  `api/_lib/security.py`) — not plaintext, not reversible.
- `otp_codes.code_hash` stores a hash of the OTP, never the raw code, and
  each row expires (`expires_at`) and is single-use (`used`).
- All foreign keys cascade on delete, so removing a user cleanly removes
  their decks, cards, goals, study log, and pending OTPs.
- All application queries use parameterized statements (`%s` placeholders
  via PyMySQL) — never string-formatted SQL. See `api/_lib/db.py`.
