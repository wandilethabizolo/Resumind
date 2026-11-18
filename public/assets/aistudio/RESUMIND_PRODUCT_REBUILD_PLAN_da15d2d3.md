# ResuMind — Product and Engineering Rebuild Plan

**Date:** 18 November 2026  
**Basis:** Static inspection of the uploaded `resumind.zip` source and the technical audit.  
**Status:** Planning baseline — implementation and runtime verification have not yet been performed.

## 1. Product direction

ResuMind will become one integrated professional networking and career-development platform inspired by the interaction model of LinkedIn, while retaining its own identity and AI-powered career tools.

The product will use one account system, one application shell, one backend and one shared data model. Candidate, professional, employer/recruiter and administrator experiences will be permission-controlled areas of the same product, not separate applications with separate logins.

The product should support Eswatini-first adoption and be designed so that additional countries, currencies, languages and job markets can be supported later without rebuilding the core.

### Product principles

1. One identity and one login per person.
2. A professional profile is the user's central identity across networking, jobs and career tools.
3. Employers and recruiters operate through organization workspaces connected to their personal accounts.
4. Administrators use the same application shell but have a strictly restricted administration area.
5. No payment checkout, payment provider, paid plan, wallet, top-up, purchased credit or payment webhook functionality.
6. AI usage may be subject to internal fair-use limits and operational monitoring, but users do not buy or manage credits.
7. Security, privacy, moderation, accessibility and mobile usability are product requirements, not later polish.
8. Existing useful code is reused only after it passes review and tests. No untested feature is represented as operational.

## 2. Product information architecture

### Main signed-in navigation

- **Home:** personalised professional feed, post composer, suggested people and organizations.
- **My Network:** invitations, connections, following and people discovery.
- **Jobs:** job search, filters, job detail, saved jobs and applications.
- **Messages:** private conversations, message requests, unread states and safety controls.
- **Notifications:** networking, content, job and account activity.
- **My Profile:** professional identity, experience, education, skills, certificates, projects and visibility controls.
- **Career Studio:** CV analysis, CV builder, job-specific tailoring, cover letters, interview coach and professional documents.
- **For Employers:** organization workspace, company page, job publishing, applicant pipeline and team membership. Show this entry only to users with an employer/organization membership or a valid invitation to create one.
- **Admin:** platform administration, only for authorised staff. This is an area inside the same application, not a separate portal or authentication system.

The exact navigation may adapt to screen width. Mobile should use a compact bottom navigation for the most-used areas and a clearly organised secondary menu.

## 3. Feature scope and acceptance outcomes

### 3.1 Identity and professional profiles

Features:
- Registration, login, logout, email verification and password reset.
- One personal account with a stable user identity.
- Profile photo, banner, headline, location, summary and contact/visibility preferences.
- Work experience, education, skills, certificates, projects, achievements and languages.
- CV files and profile export/download.
- Profile visibility settings and profile completeness guidance.
- User settings, active sessions and account deletion/export controls.

Acceptance outcomes:
- A user can maintain one profile and reuse it for networking and job applications.
- Users cannot edit another person's profile or private information.
- Profile fields obey visibility preferences in feeds, search, APIs and exports.

### 3.2 Network and social feed

Features:
- Create, edit and delete own posts containing text and supported media.
- Feed ranking initially uses a transparent, understandable chronological/relevance mix; avoid opaque ranking until there is sufficient usage data.
- Like/react, comment, reply, share/repost and save.
- Connect, accept/reject/withdraw invitations, disconnect and follow/unfollow.
- Discover people and organizations using searchable profile fields.
- Report content/users, block users and mute/unfollow accounts.
- Moderation queues and content status.

Acceptance outcomes:
- Feed and engagement actions are authenticated and ownership-checked.
- Blocked users cannot message or interact with each other in prohibited ways.
- Reports create reviewable moderation records and do not automatically expose reporter identity to the reported user.

### 3.3 Jobs and applications

Features:
- Search/filter jobs by keyword, location, work arrangement, job type, experience level, industry and posting date.
- Job detail pages, saved jobs and application tracking.
- Apply using the user's profile and selected CV/documents.
- Employer organization pages and verified organization status.
- Employer job creation, draft/review/published/closed states and job expiry.
- Applicant list, candidate application detail, internal notes and controlled recruitment-stage transitions.
- Candidate/employer notifications.

Acceptance outcomes:
- Candidates can access only their own applications and documents.
- Employer members can access only organizations where they have active membership and the required organization role.
- A job cannot be published by an unverified or suspended organization where verification is required by policy.
- Recruitment state changes are validated server-side and audited.

### 3.4 Messaging and notifications

Features:
- One-to-one conversations initially; group conversations can follow after moderation and membership rules are proven.
- Message requests and controls for who can initiate contact.
- Unread counts, timestamps, delivery/read states where reliably supported.
- Realtime updates using the existing Socket.IO foundation after authentication and authorization are hardened.
- Notifications for invitations, messages, comments, mentions, job applications and recruitment updates.
- Block/report controls and notification preferences.

Acceptance outcomes:
- Socket connections authenticate using the same account/session policy as HTTP APIs.
- Every conversation read/write checks membership server-side.
- Users cannot subscribe to or retrieve another user's private conversation by guessing an ID.

### 3.5 AI Career Studio

Retain and consolidate the existing AI capabilities:
- CV parsing and analysis.
- CV builder and multiple layouts.
- Job-specific CV tailoring and improvement suggestions.
- Cover-letter generation.
- Interview practice/coach.
- Career development guidance.
- Professional document studio.

Acceptance outcomes:
- AI requests are authenticated, validated, rate-limited and associated with the requesting user.
- AI output is presented as assistance for user review, not guaranteed truth or guaranteed job outcomes.
- Uploaded documents are handled with file-size/type validation, parser hardening and privacy controls.
- No wallet, credit counter, top-up or payment is required to use the product.
- Internal usage telemetry can monitor provider cost and abuse without exposing a purchased-credit economy to users.

### 3.6 Organization and employer workspace

Features:
- Organization creation request and verification workflow.
- Company profile, logo, description, website and location.
- Organization membership and invitations.
- Organization roles such as Owner, Admin, Recruiter and Viewer, with least-privilege permissions.
- Job management and applicant pipeline.
- Organization activity history for sensitive actions.

Acceptance outcomes:
- A person's personal profile remains separate from their authority to act for an organization.
- Every organization action checks active membership, role and organization ID on the server.
- Removing a member immediately removes their organization access.

### 3.7 Administration and trust operations

Features:
- Restricted admin dashboard in the same application.
- User and organization search, suspension and reinstatement workflows.
- Organization verification and job/content review.
- Report queue, moderation decisions and appeal handling.
- Admin account creation and role changes through a SuperAdmin-controlled workflow.
- Admin MFA, session controls and immutable audit events for sensitive actions.
- Operational metrics, error visibility and service readiness.

Acceptance outcomes:
- No public registration path can create an administrator.
- SuperAdmin privileges are narrowly assigned and every elevation is audited.
- Admin APIs enforce permissions independently of frontend visibility.
- Admin access is monitored and can be revoked promptly.

## 4. Unified account and permission model

Do not model the application as three unrelated portals. Use one user identity and separate role/membership records.

Suggested conceptual model:

- `users`: identity, login credentials, account status and core settings.
- `profiles`: professional/public profile information.
- `user_roles`: platform-level capabilities such as user, moderator, admin and superadmin.
- `organizations`: employer/company pages.
- `organization_members`: user-to-organization membership, role, status and invitation lifecycle.
- `sessions`: secure active sessions and revocation state.
- `audit_events`: security-sensitive and administrative actions.

A user may be a job seeker and also a recruiter for one organization. Organization membership grants employer capabilities only within that organization. Admin capabilities are separate platform-level privileges and must never be granted by ordinary organization membership.

The backend is the authority for access control. Hiding a menu item is not authorization.

## 5. Payment and credit removal scope

Remove payment functionality end-to-end, not merely the checkout button.

### Remove from the frontend

- Checkout and payment pages/modals.
- Top-up and wallet views.
- Credit balance, credit history and purchased-credit displays.
- Paid plans, plan comparison, upgrade prompts and payment settings.
- Payment-related navigation, labels and empty states.

### Remove from the API/backend

- Checkout-session creation routes.
- Payment webhook routes and signature-verification code.
- Payment verification/crediting routes.
- Payment-provider adapters, secrets and environment variables.
- Plan/price configuration used only for purchasing.
- Credit purchase, top-up, purchase refund and wallet-mutation code.
- Payment-specific email templates, notifications, logs and scheduled jobs.

### Database and migration treatment

- Identify every payment, checkout, plan, wallet, credit batch, credit transaction and payment-event table/column/reference.
- Take a verified database backup before destructive schema changes.
- Decide whether historical payment/credit records must be retained for accounting/audit obligations. If retention is required, export/archive them in a restricted, non-user-facing archive before removing live product tables and routes. Do not silently destroy records that may be legally required.
- Remove obsolete tables/columns only through reviewed, versioned migrations after dependency searches and staging verification.
- Keep a minimal internal AI usage/abuse telemetry record if needed for operational cost controls; it must not represent a balance, purchase, wallet or user entitlement.
- Remove obsolete provider secrets from deployment configuration and rotate any secrets that may have been exposed.

The release must fail if a payment route, checkout component or payment-provider configuration remains reachable in the production application.

## 6. Technical architecture

### Frontend

- Keep React and TypeScript as the shared UI foundation.
- Reorganize the frontend around a single authenticated application shell and feature modules.
- Use route-level lazy loading for large areas such as Career Studio and Admin.
- Create a consistent design system: typography, spacing, colour tokens, buttons, forms, cards, dialogs, loading states and error states.
- Responsive layouts for desktop, tablet and mobile.
- Keep accessibility, keyboard navigation, contrast and clear empty/error states in acceptance criteria.

### Mobile strategy

- First make the shared React application fully responsive and PWA-capable.
- Then package the same application for Android and iOS using a maintained native shell such as Capacitor, after checking compatibility for authentication, file upload/download, push notifications, deep links and camera/gallery access.
- Do not claim native app readiness until actual Android and iOS builds are installed and tested on devices.
- If later requirements demand extensive native capabilities or materially different mobile UX, reassess a dedicated native client while retaining the same backend/API.

### Backend

- Keep Express + TypeScript initially to reduce unnecessary rewrites.
- Organize API code by domain: auth, profiles, network, feed, jobs, applications, organizations, messaging, notifications, career AI, moderation and admin.
- Keep route handlers thin; put business rules in services and database access in repositories.
- Validate every request and response contract.
- Add structured logs, request IDs, safe error responses, metrics and health/readiness separation.

### Database

- Keep PostgreSQL.
- Standardize on Drizzle as the only ORM/migration system after checking deployment dependencies.
- Retire Sequelize models, connection and migration runner only after confirming no deployed service relies on them.
- Remove runtime DDL from application startup. Use reviewed, versioned migrations.
- Add foreign keys, unique constraints, CHECK constraints and query-driven indexes.
- Use JSONB only for genuinely flexible structured fields; normalize entities that need independent lifecycle, permissions or querying.
- Define backup, restore and migration rollback procedures.

### Realtime and file storage

- Review existing Socket.IO service and use authenticated, authorized rooms for messaging and notifications.
- Define a storage abstraction for profile images, post media, CVs and application documents. Use private storage and short-lived authorized access for sensitive documents.
- Set file size/type limits and validate file contents rather than trusting file extensions.
- Add malware scanning or a documented compensating control before accepting arbitrary public uploads.

### AI integration

- Keep the current Google Gemini integration behind a provider/service boundary.
- Centralize prompt templates, input validation, output validation, safety handling, timeouts and retry policy.
- Keep provider secrets on the server only.
- Add fair-use rate limits and operational usage monitoring; do not expose purchased credits or payment entitlements.

## 7. Security and privacy baseline

The previous static audit identified specific work that must be completed before launch:

1. Inventory credential formats, migrate any legacy plaintext credentials safely and remove plaintext password comparison fallback.
2. Replace or harden localStorage bearer-token handling with a deliberate session design; assess Secure/HttpOnly/SameSite cookies and CSRF controls.
3. Persist password-reset challenges as hashed, expiring, single-use records with atomic attempt limits.
4. Replace process-local login throttling with shared rate limiting; protect registration and password-reset endpoints too.
5. Revoke active sessions after password reset/change and provide session revocation controls.
6. Remove database runtime fallback to administrator credentials; use a least-privilege application DB role.
7. Remove schema mutation at application startup; run migrations as a controlled deployment operation.
8. Add Helmet/security headers, explicit CORS policy, request-size limits, input validation, output redaction and request correlation.
9. Add MFA for administrators and secure SuperAdmin provisioning.
10. Test object-level authorization (IDOR/BOLA) across profiles, posts, conversations, files, applications, jobs and organizations.
11. Protect private documents and enforce profile visibility in search and API responses.
12. Add abuse controls for messaging, invitations, comments, posts, uploads and AI requests.
13. Add data export, account deletion and retention workflows with clear user-facing explanations.

## 8. Delivery sequence

Work should proceed in controlled engineering stages. Do not redesign the entire UI before the account, data and authorization foundations are stable.

### Stage A — Baseline and safe working copy

- Preserve the original uploaded ZIP unchanged.
- Create a clean working branch/copy and document the current run/build instructions.
- Inventory every frontend route, API endpoint, database table, environment variable, scheduled task and dependency.
- Establish a reproducible install, type-check, test and build baseline.
- Record existing features that work, partially work or are only mock/demo functionality.

**Exit gate:** reproducible baseline and feature inventory; no original source overwritten.

### Stage B — Domain and database foundation

- Approve the unified user/profile/role/organization model.
- Select Drizzle as the only ORM after deployment dependency checks.
- Create versioned migrations and remove runtime DDL.
- Plan payment/credit data archival and removal.
- Add constraints, indexes, foreign keys and migration tests.

**Exit gate:** fresh database and upgrade migration tests pass in staging; backup/restore procedure documented.

### Stage C — Authentication and authorization

- Harden credentials, sessions, password reset, rate limits and administrator MFA.
- Implement platform roles and organization membership roles.
- Add central authorization policies and audit events.
- Write negative tests for cross-user and cross-organization access.

**Exit gate:** authentication, session revocation, role checks and object-ownership tests pass.

### Stage D — Remove payments and credit economy

- Remove all payment and credit UI, API, backend services, environment variables and dependencies that are payment-only.
- Archive records if retention is required; migrate live schema safely.
- Replace credit gating with server-side fair-use/abuse controls where needed.
- Add automated checks confirming no payment endpoints/components remain exposed.

**Exit gate:** payment-related routes return no active functionality; no wallet/credit purchase flow remains; core career features still work under fair-use controls.

### Stage E — Unified application shell and profiles

- Build the single responsive navigation and authenticated route structure.
- Consolidate account settings and professional profile.
- Integrate existing candidate profile and profile-completion components.
- Implement visibility and privacy settings.

**Exit gate:** one login, one profile, role-aware navigation and responsive profile workflows work end-to-end.

### Stage F — Network and content

- Build connections/following, invitations, feed, posts, comments, reactions, shares, saves and reporting.
- Add moderation tools and block/mute controls.
- Add search and suggested connections using safe, explainable rules.

**Exit gate:** social actions, moderation and privacy rules pass API and UI tests.

### Stage G — Jobs and employer workspace

- Consolidate job discovery and job tracking.
- Add organization pages, memberships and verification.
- Integrate employer job publishing and applicant pipeline into the same app.
- Add recruitment notifications and audit history.

**Exit gate:** candidate and employer workflows work with strict organization isolation.

### Stage H — Messaging, notifications and Career Studio

- Harden and integrate realtime messaging.
- Add notifications and preferences.
- Consolidate CV analysis, builder, cover letters, interview coach and document studio.
- Add document security and AI fair-use limits.

**Exit gate:** messaging privacy, notification delivery, document handling and AI workflows pass end-to-end tests.

### Stage I — Administration and operational readiness

- Integrate admin workspace behind platform-level roles.
- Add user/org/content moderation, reports, audit logs, MFA and operational metrics.
- Add error monitoring, backups, restore drills, privacy review and incident procedures.

**Exit gate:** admin permissions and audit trail verified; operations can detect, investigate and recover from failures.

### Stage J — Web and mobile release verification

- Run clean production builds and automated tests.
- Test staging with realistic user, recruiter, employer and administrator accounts.
- Test Android and iOS packages on real devices.
- Verify app installation/update, authentication, deep links, uploads/downloads, notifications and offline/poor-network states.
- Conduct security review and resolve all critical/high findings.

**Exit gate:** release checklist signed off; no critical/high unresolved security issues; no feature is advertised as working unless tested.

## 9. Testing strategy

Required automated and manual coverage:

- Unit tests for services, validation and permission policies.
- API integration tests for every domain.
- Database migration tests from empty and representative existing databases.
- Authentication, password reset, session expiry and revocation tests.
- Role and object-level access tests for all user/organization resources.
- Concurrency tests for invitations, applications, feed engagement and messaging.
- Upload/parser tests for malformed PDFs/DOCX, excessive size, decompression and resource exhaustion.
- AI timeout, provider failure, malformed output and rate-limit tests.
- Accessibility, responsive layout and cross-browser tests.
- Android/iOS device tests before claiming mobile readiness.
- Dependency scanning, secret scanning and production configuration checks.

## 10. Definition of done

ResuMind is ready for a public release only when:

- One account can use the professional network, Career Studio and eligible employer workspace.
- There are no separate candidate/employer/admin applications or duplicate login systems.
- Admin tools are integrated but protected by server-enforced platform roles and MFA.
- Payment checkout, gateways, webhooks, wallet, credit purchases and paid plans are removed.
- Profiles, connections, posts, jobs, applications, messaging and notifications pass end-to-end tests.
- Private files and personal data are protected by access checks and privacy settings.
- Database migrations are reproducible and backups can be restored.
- Build, type-check, tests and mobile smoke tests pass in CI/release verification.
- Critical and high security findings are closed or formally risk-accepted with documented mitigations.
- Product pages and marketing do not claim untested features are operational.

## 11. Important risks and decisions

- **Data loss:** payment/credit tables may contain historical records. Back up and decide retention before dropping them.
- **Existing deployments:** Sequelize may be used by an environment not visible in the uploaded ZIP. Confirm before removing it.
- **Scope:** a LinkedIn-style platform is a substantial product. Build in the sequence above, with secure identity and profiles first, rather than attempting every feature simultaneously.
- **Moderation:** social networking creates spam, harassment, impersonation and fraudulent job risks. Reporting, blocking, organization verification and admin workflows are core features.
- **AI cost/abuse:** removing user payments does not remove the provider cost of AI. Apply fair-use limits, monitoring and abuse controls without a user credit wallet.
- **Mobile:** responsive web/PWA is not proof of native Android/iOS readiness. Actual packaged builds and device testing are required.

## 12. Source-grounded current-state notes

The uploaded source contains React/TypeScript frontend files, an Express/TypeScript server, PostgreSQL/Drizzle schema and repository code, Sequelize model/migration files, candidate/employer/admin UI areas, AI services, job discovery/tracking, profile and career tools, Socket.IO/WebRTC-related services, and payment/credit code.

The prior static audit found unresolved architecture and security risks: competing ORM/migration systems, runtime DDL, process-local login throttling and password-reset state, localStorage bearer-token persistence, a legacy password comparison fallback, weak database credential fallback, incomplete admin provisioning, and an incomplete payment integration. These are static inspection findings, not confirmed runtime exploits.

A full dependency install, type-check, production build, database migration, integration test suite, Android build and iOS build have not yet been run in this environment. The plan therefore does not claim those checks have passed.

---

**Recommended immediate next action:** begin Stage A on a clean copy of the uploaded source, create the feature/API/database inventory, then implement Stage B and Stage C before the major interface redesign.
