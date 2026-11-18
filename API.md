# ResuMind API Reference

All protected endpoints require `Authorization: Bearer <Firebase ID Token>` and optional `x-session-key`.

## Authentication & Sessions (`/api/auth`)
- `POST /api/auth/session` — Sync Firebase user to PostgreSQL, initialize/resume session, return user, profile, org memberships, unread notification count.
- `GET /api/auth/sessions` — List active and revoked sessions for current user.
- `POST /api/auth/sessions/:id/revoke` — Revoke a specific session.
- `POST /api/auth/sessions/revoke-others` — Revoke all other active sessions.
- `POST /api/auth/mfa/setup` — Initialize TOTP MFA secret for staff roles.
- `POST /api/auth/mfa/verify` — Verify 6-digit TOTP code and unlock Admin MFA for the session.
- `GET /api/auth/export` — Export user's personal profile, posts, applications, and CV documents as JSON.
- `DELETE /api/auth/account` — Permanently delete current user account.

## Profiles (`/api/profiles`)
- `GET /api/profiles?q=&country=` — Search discoverable profiles.
- `GET /api/profiles/:id` — View profile subject to `visibility` and `blocks`.
- `PUT /api/profiles/me` — Update authenticated user's own profile.

## Network (`/api/network`)
- `GET /api/network/overview` — Connections, incoming/outgoing invitations, suggestions, blocked list.
- `POST /api/network/connect` — Send connection invitation.
- `POST /api/network/requests/:id/respond` — Accept or reject invitation.
- `DELETE /api/network/connections/:targetUserId` — Remove connection.
- `POST /api/network/follow/:targetUserId` — Toggle follow/unfollow.
- `POST /api/network/block/:targetUserId` / `DELETE /api/network/block/:targetUserId` — Block/unblock user.

## Feed & Posts (`/api/feed`)
- `GET /api/feed?topic=&saved=` — Fetch visible feed posts, trending topics, suggested organizations.
- `POST /api/feed` — Create update, achievement, article, or repost.
- `PATCH /api/feed/:id` — Edit own post.
- `DELETE /api/feed/:id` — Delete own post (or staff).
- `POST /api/feed/:id/react` — Toggle reaction.
- `POST /api/feed/:id/save` — Toggle bookmark.
- `GET /api/feed/:id/comments` / `POST /api/feed/:id/comments` — List and add comments/replies.

## Jobs & Applications (`/api/jobs`)
- `GET /api/jobs` — Search & filter published jobs (`q`, `country`, `location`, `workArrangement`, `employmentType`, `experienceLevel`).
- `GET /api/jobs/applications/me` — List candidate's applications.
- `POST /api/jobs/:id/save` — Save/unsave job.
- `POST /api/jobs/:id/apply` — Submit application with optional owned `cvDocumentId` and cover note.
- `POST /api/jobs/applications/:appId/withdraw` — Withdraw active application.

## Employers & Organizations (`/api/organizations`)
- `GET /api/organizations` / `POST /api/organizations` — List organizations / create organization workspace.
- `PATCH /api/organizations/:id` — Update organization profile (`owner`/`admin`).
- `POST /api/organizations/:id/verify-request` — Request platform verification.
- `GET /api/organizations/:id/members` / `POST /api/organizations/:id/members` / `DELETE /api/organizations/:id/members/:memberId` — Manage org team.
- `GET /api/organizations/:id/jobs` / `POST /api/organizations/:id/jobs` / `PATCH /api/organizations/:id/jobs/:jobId` — Manage org jobs.
- `GET /api/organizations/:id/applications` / `PATCH /api/organizations/:id/applications/:appId/stage` — Manage applicant pipeline.
- `GET /api/organizations/:id/analytics` — Organization hiring metrics.

## Messaging & Notifications (`/api/conversations`, `/api/notifications`)
- `GET /api/conversations` / `POST /api/conversations` — List threads & requests / start 1:1 thread.
- `GET /api/conversations/:id/messages` / `POST /api/conversations/:id/messages` — Read & send messages (membership-checked + Socket.IO broadcast).
- `POST /api/conversations/:id/accept` / `POST /api/conversations/:id/read` — Accept request / mark read.
- `GET /api/notifications` / `POST /api/notifications/:id/read` / `POST /api/notifications/read-all` — Notifications management.

## Career Studio (`/api/career`)
- `GET /api/career/overview` — Load CV documents, versions, analyses, generated docs, interview sessions.
- `POST /api/career/cv-documents` / `DELETE /api/career/cv-documents/:id` — Upload/parse PDF, DOCX, TXT CV documents.
- `POST /api/career/analyze-cv` — Run Gemini CV analysis & job tailoring.
- `POST /api/career/cv-versions` / `PUT /api/career/cv-versions/:id` / `DELETE /api/career/cv-versions/:id` — CV Builder CRUD.
- `POST /api/career/cover-letter` — Generate tailored cover letter.
- `POST /api/career/interview/start` / `POST /api/career/interview/:id/answer` — AI Interview Coach.
- `POST /api/career/guidance` — Career guidance & skills pathway.
- `POST /api/career/documents` / `PUT /api/career/documents/:id` / `DELETE /api/career/documents/:id` — Document Studio CRUD.

## Reports & Admin (`/api/reports`, `/api/admin`)
- `POST /api/reports` — Submit moderation report.
- `GET /api/admin/overview` — Platform overview (staff + MFA required).
- `POST /api/admin/users/:id/status` — Suspend/reinstate account.
- `POST /api/admin/users/:id/role` — Assign platform role (`superadmin` + MFA required).
- `POST /api/admin/organizations/:id/moderate` — Verify or suspend organization.
- `POST /api/admin/jobs/:id/moderate` / `POST /api/admin/posts/:id/moderate` — Moderate content.
- `POST /api/admin/reports/:id/resolve` — Resolve or dismiss reports.
