# ResuMind — Professional Networking & AI Career Development Platform

ResuMind is a unified, Eswatini-first and pan-African professional networking, recruitment, and AI-powered career development platform built with React, TypeScript, Express, Socket.IO, Drizzle ORM, PostgreSQL (Cloud SQL), Firebase Authentication, and Google Gemini.

## Architecture Overview

- **One Integrated Application**: Single React SPA + single Express/Socket.IO backend + single PostgreSQL database + single Firebase Auth identity.
- **Role-Based Capabilities**: Users can simultaneously act as professionals, job seekers, and organization recruiters/owners. Platform moderators, admins, and superadmins operate inside the same shell behind strict server-enforced roles and TOTP MFA.
- **No Payments or Credit Wallets**: All payment gateways, checkout flows, subscriptions, wallets, and purchased credits are excluded. AI Career Studio uses server-side hourly fair-use rate limits (`ai_usage_events`).

## Installation & Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables based on `.env.example`:
   - `GEMINI_API_KEY` (server-side only)
   - `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD` (runtime least-privilege app role)
   - `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` (schema migrations via Drizzle Kit)
   - `APP_URL` (CORS allowlist origin)
   - `SUPERADMIN_EMAIL` (optional email for initial SuperAdmin role assignment on verified sign-in)
3. Push or migrate the PostgreSQL schema via Drizzle:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```
4. Start the unified dev server on port 3000:
   ```bash
   npm run dev
   ```

## Production Build & Deployment

```bash
npm run lint
npm run build
npm start
```

## Testing

Run type-checking and automated security/unit tests:
```bash
npm run lint
npx tsx --test tests/security.test.ts
```

## Mobile & PWA Readiness

- **Implemented & Active**: Responsive mobile-first layout, bottom navigation, `vite-plugin-pwa` manifest, offline connectivity indicator, and in-app install prompt (`PWAInstallButton`).
- **Native Packaging Assessment**: The Vite React build (`dist/`) is compatible with Capacitor (`@capacitor/android`, `@capacitor/ios`) for wrapping into native mobile packages. Native APK/IPA binaries have **not** been compiled or tested on physical Android/iOS devices in this web environment.

## Honest Scope & Limitations

- **Source Archive Note**: The workspace started with the `RESUMIND_PRODUCT_REBUILD_PLAN` specification and starter template (no pre-existing `resumind.zip` archive was present in the directory), so all backend, database, security, and frontend modules were authored cleanly from scratch.
- **Document Parsing**: PDF and DOCX uploads validate file magic bytes (`%PDF-` / `PK`) and extract text safely in memory without external binary dependencies; complex scanned-image PDFs require text-based PDFs or pasted text.
- **Native Mobile Builds**: Web and PWA are implemented and verified; native Android/iOS Capacitor packages remain a documented next step requiring Xcode/Android Studio.
