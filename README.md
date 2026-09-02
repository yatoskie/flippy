# Flippy — three-layer architecture

A flashcard study app split into three independently deployable layers:

```
flippy-app/
├── frontend/    Pure HTML/CSS/JS → GitHub Pages
├── api/         Python REST + SOAP → Vercel Serverless Functions
├── database/    Portable MySQL schema → Vercel-hosted MySQL now, Hostinger later
├── .env.example
└── vercel.json
```

Each layer works standalone and degrades gracefully if the others aren't
deployed yet — that's the point of building them separately.

---

## How the pieces fit together

**Frontend → API:** the frontend calls a single constant, `API_BASE_URL`,
defined at the top of `frontend/assets/js/api-client.js`. Nothing else in
the frontend references a backend URL. Point that one constant at your
Vercel deployment and every page picks it up.

**Frontend fallback:** if the API is unreachable (not deployed yet, or the
person is offline), every write and read falls back to `localStorage`
(`frontend/assets/js/app.js` → `FlippyStore`) — the app you saw in the
previous build. Auth flows (signup/login/OTP/password) try the API first
and fall back to a local simulation; decks/cards/goals save to
`localStorage` immediately for responsiveness and best-effort sync to the
API in the background.

**API → Database:** every endpoint in `api/*.py` imports `get_connection()`
from `api/_lib/db.py` — the only place a DB connection is ever opened.
That file reads five environment variables (`DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, `DB_NAME`) and nothing else. Change those values
in your environment (Vercel dashboard now, wherever else later) and the
whole API points at a different database with zero code changes.

**REST vs. SOAP:** general data — decks, cards, goals, non-sensitive
profile fields — goes through REST (`api/decks.py`, `api/cards.py`,
`api/goals.py`, `api/users.py`). Account security — signup, login, OTP
verification, password reset, password change — goes through a single SOAP
endpoint (`api/auth.py`), so the highest-risk operations sit behind one
strictly-typed XML contract (documented in `api/security.wsdl`) instead of
being spread across general-purpose REST routes.

---

## Deploy each layer

### 1. Database (now: something Vercel can reach)

Any standard MySQL host works — see `database/README.md`. Run
`database/schema.sql` once against it.

### 2. API → Vercel

1. Push this repo (or just the parts you need) to GitHub.
2. Import it into Vercel as a new project.
3. In Vercel Project Settings → Environment Variables, set everything from
   `.env.example`: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
   `DB_NAME`, `APP_SECRET` (generate a real random value — see the comment
   in `.env.example`), and `ALLOWED_ORIGIN` (your GitHub Pages URL, or `*`
   while testing).
4. Deploy. Vercel auto-detects `api/*.py` as serverless functions from
   `requirements.txt` + `vercel.json`.
5. Test it:
   ```bash
   curl -X OPTIONS https://your-project.vercel.app/api/decks -i
   ```
   A 204 with CORS headers back means it's live.

### 3. Frontend → GitHub Pages

1. Open `frontend/assets/js/api-client.js` and set `API_BASE_URL` to your
   Vercel deployment URL. This is the only edit needed.
2. Push the `frontend/` folder's contents to a GitHub repo (`index.html`
   at the repo root of that repo, or the branch/folder your Pages source
   points at).
3. Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save.
4. Live at `https://yourusername.github.io/flippy/`.

The frontend works even before steps 1–2 are done — it just runs in pure
local-storage mode until `API_BASE_URL` points at something real.

---

## Migrating the database to Hostinger later

1. Create a MySQL database in Hostinger's hPanel.
2. Run `database/schema.sql` against it (same file, unmodified).
3. `mysqldump` the Vercel-hosted database and import into Hostinger if you
   have data to carry over.
4. Update `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` wherever
   the API is running to Hostinger's values.

No code changes in `api/` or `frontend/` are needed — this is exactly the
"one config change" the project was built around.

---

## Local development

**Frontend:** open `frontend/index.html` directly, or serve it:
```bash
cd frontend && python -m http.server
```

**API:** install deps and set env vars, then run with the Vercel CLI
(matches production behavior closest) or any ASGI/WSGI-adjacent local
runner of your choice:
```bash
cd api
pip install -r requirements.txt --break-system-packages
cp ../.env.example ../.env   # fill in real values
npm i -g vercel               # if you don't have it
vercel dev
```

**Database:** point `DB_HOST` etc. at a local MySQL instance and run
`database/schema.sql` against it, or use the same Vercel-hosted instance
from local development too.

---

## Security notes carried over from the spec

- All SQL is parameterized (`%s` placeholders via PyMySQL) — see every
  query in `api/*.py` and `api/_lib/db.py`. Never string-formatted.
- Passwords are hashed with PBKDF2-SHA256 + per-user salt
  (`api/_lib/security.py`), never stored or logged in plaintext.
- OTP codes are hashed at rest, expire in 10 minutes, and are single-use.
- `RequestPasswordReset` always returns success regardless of whether the
  email matches an account, so it can't be used to enumerate users.
- CORS is restricted via `ALLOWED_ORIGIN` — set this to your real GitHub
  Pages origin before you consider this production-ready; `*` is for
  testing only.
