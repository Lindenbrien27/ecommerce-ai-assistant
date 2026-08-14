# Admin Login & Panel Access — Design

**Goal:** Let one seeded admin sign in with their Google account and reach a protected `/admin` panel (the Catalog Admin UI already mocked as an artifact). Scoped strictly to *authentication and access* — the actual products/promos CRUD backend behind `/admin` is a separate, later spec.

**Non-goals:** Admin self-signup, multiple admins via an invite flow, password-based admin login, any change to the existing customer OTP flow (`VerifyForm.jsx`, `otpService.js`).

## Why this shape

This app currently has **no user-accounts table at all** — customers are just an email string on `orders`/`otp_codes`, and auth is OTP-only, deliberately low-friction (see `otpService.js`'s own comments on never revealing whether an email has an account). A sibling in-progress branch (`account-settings-backend`) adds a `customer_profiles.role` column, but that's a self-reported profile label a customer types into their own settings — not an authorization mechanism, and not reusable as one.

Admin needs its own, fully independent auth track: own table, own token shape, own middleware, own frontend context, own login page. Nothing shared with customer auth except infrastructure both already need (`pg`, `jsonwebtoken`, `express-rate-limit`).

**Fidelity level:** dev-minimal — one seeded admin, no cost beyond a few small free npm packages and a one-time Google Cloud Console registration the developer does themselves. Not a production-grade multi-admin system; that's a straightforward additive change later, not a rewrite.

## Auth mechanism: Google Sign-In (ID-token POST), not passwords

Chosen over password auth because it removes password hashing/reset code entirely and fits a single-admin allowlist naturally. Uses Google Identity Services' client-side button + ID-token flow (not the server-redirect Authorization Code flow) — no `redirect_uri` to register/mismatch, no cross-origin redirect handling.

Flow:
1. `AdminLoginPage` renders Google's "Sign in with Google" button (Google Identity Services JS, loaded from `accounts.google.com`).
2. On success, the browser gets back a signed Google ID token and POSTs it to `POST /api/admin/auth/google`.
3. Backend verifies the token with `google-auth-library` (checks signature + that `aud` matches our Client ID), extracts the email.
4. Looks up that email in the `admins` table.
   - Found → issue our own JWT (`{ adminId, email, role: 'admin' }`, 30 min TTL), set as an httpOnly cookie.
   - Not found → generic 403. This is an **allowlist**, not a signup flow — no row is ever created here.

## Data model

```sql
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

No `password_hash` — Google is the only identity proof. Seeded with exactly one row directly in the migration (the developer's own email), same pattern as `migrations/1785631599842_add-dev-seed-account.sql`. Adding a second admin later is a plain `INSERT`, no code change.

## Session: httpOnly cookie, not sessionStorage

The existing customer token lives in `sessionStorage` (`AuthContext.jsx`) — fine for a low-value session, but XSS-readable. An admin session is a higher-value target (can edit the catalog), so it gets an httpOnly, `Secure` (prod), `SameSite=Lax` cookie instead — unreadable to any injected script. This app is same-origin (Express serves the built frontend directly, see `app.js`), so no CORS complexity follows from this.

Consequence: since JS can't read an httpOnly cookie, `AdminProtectedRoute` can't just check "is there a token" locally the way `ProtectedRoute` does. It instead calls `GET /api/admin/auth/me` on mount (cookie rides along automatically) and redirects to `/admin/login` on a 401. One extra network round-trip on load, in exchange for the token being unreadable to script.

## CSP: a real, scoped exception is required

`securityHeaders.js` currently ships a deliberately strict CSP (`script-src 'self'`, no `frame-src` override so it falls back to `default-src 'self'`, `crossOriginEmbedderPolicy: true` → `Cross-Origin-Embedder-Policy: require-corp`) — its own comment says this is safe *because* "no external fonts, no CDN scripts... nothing to embed." Google's sign-in button breaks that assumption: it loads a script from `accounts.google.com` and renders its own iframe from the same origin.

This needs a route-scoped CSP override for `/admin/login` only, mirroring the existing `apiDocsStyleOverride` pattern (a second `helmet.contentSecurityPolicy(...)` applied just to that one route, everywhere else keeps the strict default):
- `script-src`: add `https://accounts.google.com/gsi/client`
- `frame-src`: add `https://accounts.google.com`
- `connect-src`: add `https://accounts.google.com`

**Known risk to verify during implementation:** `crossOriginEmbedderPolicy: require-corp` has documented compatibility issues with Google Identity Services' iframe unless Google's response sends a matching `Cross-Origin-Resource-Policy` header. May need `crossOriginEmbedderPolicy: 'credentialless'` (or disabled) scoped to `/admin/login` specifically if the button doesn't render. Flagging now so it isn't a surprise mid-implementation, not something to solve in this doc.

## Backend

| File | Purpose |
|---|---|
| `src/services/adminAuthService.js` | `verifyGoogleIdToken(idToken)` (via `google-auth-library`), `findAdminByEmail`, `issueAdminToken`, `verifyAdminToken` |
| `src/controllers/adminAuthController.js` | `POST /api/admin/auth/google`, `GET /api/admin/auth/me`, `POST /api/admin/auth/logout` (clears the cookie) |
| `src/middleware/adminAuth.js` | `requireAdminAuth` — reads the cookie, verifies the JWT, checks `role === 'admin'` |
| `src/routes/adminAuthRoutes.js` | mounted at `/api/admin/auth`, behind a new stricter limiter (~5 attempts / 15 min) than the existing `authLimiter` |

New dependencies: `google-auth-library`, `cookie-parser` (both free, small, standard).

**Manual step (not code):** the developer registers an OAuth Client ID in Google Cloud Console and puts it in `.env` — a real Google-account action, out of scope for any agent to perform.

## Frontend

| File | Purpose |
|---|---|
| `frontend/src/pages/AdminLoginPage.jsx` / `AdminLoginForm.jsx` | Renders the Google button only — no email/password fields |
| `frontend/src/context/AdminAuthContext.jsx` | Holds admin identity from the `/me` check, not a locally-stored token |
| `frontend/src/components/AdminProtectedRoute.jsx` | Calls `/api/admin/auth/me`, redirects to `/admin/login` on failure |
| Router | `/admin/login` (public), `/admin` (the Catalog Admin panel, now gated) |

## Error handling

- Invalid/unrecognized Google token → generic 401.
- Valid Google token, email not in `admins` → generic 403 ("Not authorized"), no row created.
- Rate limit tripped → 429, audited via the existing `auditLog('rate_limit.exceeded', ...)` pattern.
- Expired/invalid admin cookie hitting a protected route → 401, same `auth.token_rejected` audit event shape `requireCustomerAuth` already emits, tagged from the admin middleware.

## Testing

- Backend: unit tests for `adminAuthService` (valid/invalid Google token handling with a mocked verifier, allowlist hit/miss, token round-trip), route tests for `/api/admin/auth/google` and `/me` (happy path, unauthorized email, missing/garbage token, rate limit).
- Frontend: `AdminLoginForm` render test, `AdminProtectedRoute` redirect test mirroring the existing `ProtectedRoute.test.jsx` pattern (mocking the `/me` fetch instead of reading local storage).
