# ResuMind Security Documentation

## 1. Authentication & Session Design
- **Identity Provider**: Firebase Authentication (Google Sign-In via `signInWithPopup`).
- **Token Handling**: Firebase ID tokens are kept strictly in client memory (`AuthContext`) and never persisted in `localStorage`. Every protected Express route and Socket.IO handshake independently verifies the ID token using `firebase-admin`.
- **Tracked Sessions & Revocation**: Server creates a session key in the `sessions` PostgreSQL table (`src/db/schema.ts`). Users can inspect active devices/sessions and revoke individual or all other sessions via `/api/auth/sessions/:id/revoke`. Revoked or expired sessions are rejected by `requireAuth` (`401 SESSION_REVOKED`).

## 2. Authorization & Anti-IDOR/BOLA Controls
- **Platform Roles**: `user`, `moderator`, `admin`, `superadmin`. Public sign-up always creates `user`. Only an explicit `SUPERADMIN_EMAIL` env match or an MFA-verified `superadmin` can assign platform roles.
- **Admin TOTP MFA**: All `/api/admin/*` routes enforce `requireRole(['moderator', 'admin', 'superadmin'])` AND `requireAdminMfa` using RFC 6238 TOTP (`src/server/services/totp.ts`) with constant-time `crypto.timingSafeEqual`.
- **Organization Isolation**: Every `/api/organizations/:id/*` operation checks active membership and role (`owner`, `admin`, `recruiter`, `viewer`) in `organization_members` via `requireOrgRole`.
- **Messaging Isolation**: Both HTTP `/api/conversations/:id/*` and Socket.IO `conversation:join` verify `conversation_members` membership and `blocks` status server-side before returning or broadcasting messages.
- **Profile Privacy**: `GET /api/profiles/:id` enforces `public`, `connections`, and `private` visibility and hides user email unless `showEmail` is enabled or the requester is the profile owner or staff.

## 3. Infrastructure & Data Protection
- **Least-Privilege Database Access**: Runtime queries use `SQL_USER` / `SQL_PASSWORD` via `pg.Pool` Object Method; schema management uses `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` in `drizzle.config.ts` only. No runtime DDL or eager startup DB probes exist.
- **API Hardening**: `helmet` security headers, explicit CORS origin allowlisting, `express-rate-limit` throttling, `zod` input validation on mutations, 2 MB JSON limit, and 5 MB upload limit with magic-byte checks.
- **Audit Logging**: Privileged admin actions, organization changes, report submissions, and session revocations are recorded in `audit_events`.
- **Payment Removal**: Zero payment gateways, checkout routes, credit balances, or billing webhooks exist in the codebase.
