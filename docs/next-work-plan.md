# Kids Quiz Next Work Plan

Last checked: 2026-06-11

## Current Health Check

- `pnpm run build` passes for shared types, question renderer, API, and admin web.
- API health check passes when started from the built entrypoint: `node apps/api/dist/main.js`.
- `pnpm smoke:e2e` passes against a temporary API process.
- `pnpm smoke:isolation` passes and verifies cross-owner and cross-student data isolation.
- `pnpm smoke:rewards` passes and verifies database-backed reward catalog/redemption flows plus legacy JSON migration.
- `pnpm smoke:ui` passes and verifies import-page validation, real Excel upload import, batch tracking, review paper generation, and child reward request / parent approval in the browser.
- `pnpm smoke:all` is available as a full regression wrapper: build, built API, API smokes, and browser UI smoke.
- `pnpm smoke:deployment` is available for production-like Nginx/API split checks: public API health, frontend assets, SPA fallback, uploads proxy, optional CORS, and optional admin login.
- Admin web routes are lazy-loaded by page. The previous Vite main chunk warning is resolved; the production entry chunk is about 254 kB.

## Hardening Completed

1. Admin login baseline is complete.
   - `POST /admin/auth/login` issues JWTs.
   - Invalid credentials return `401`.
   - Admin token storage and request attachment are implemented in the web app.

2. Admin API protection is complete.
   - Management APIs under `/admin/*` require an authenticated admin token.
   - `/health` remains public.

3. Request-scoped owner isolation is complete.
   - Question groups, papers, students, submissions, reports, rewards, and task settings are scoped to the authenticated owner.
   - Cross-owner smoke coverage verifies that user A cannot access user B's resources.

4. Student sessions and student APIs are complete.
   - `/student/login` issues student JWTs.
   - Child-facing paper, question group, submission, wrong-book, reward, task, and report flows use `/student/*` APIs.
   - Student JWT payload includes the student id and owner id.
   - Optional student PIN is supported through `Student.pinHash`.

5. Multi-student parent workflow is complete.
   - Parent-side student management is available at `/parent/students`.
   - Parent pages can select the active student and pass `studentId` to admin APIs.
   - Parent-to-child navigation syncs the selected student session.
   - Parent logout clears both admin and student sessions.

## Feature Work Completed In This Pass

The identity and isolation baseline is now in place. These five follow-up items have also been completed:

1. Excel import.
   - Reuse the existing JSON import validation and preview pipeline.
   - Supports `.xlsx`, `.xls`, `.csv`, and `.tsv` upload.
   - Provides a downloadable Excel template.
   - Keeps duplicate detection and post-import acceptance paper generation.

2. Learning report printing.
   - Adds print-friendly report metadata and A4 styles.
   - Includes selected student, time range, paper stats, knowledge-point stats, weak points, recent attempts, and 7-day trend.
   - Hides interactive controls in print output.

3. Star reward redemption.
   - Adds reward catalog management.
   - Adds student redemption requests.
   - Adds parent approval/rejection and redemption history.
   - Stores catalog and redemption history in dedicated `reward_catalog_items` and `reward_redemptions` tables while keeping star balance in `Student.totalStars`.
   - Lazily migrates legacy `taskSettings.rewardCatalog` and `taskSettings.rewardRedemptions` data into the dedicated tables.
   - Parent reward center includes redemption status filters, summary counters, keyword search, and CSV export.

4. Deployment package.
   - Adds `.env.production.example`.
   - Adds `docs/deployment.md` with database, upload directory, PM2, Nginx, backup, and release checklist guidance.

5. Regression safety.
   - `pnpm run build` passes.
   - `pnpm smoke:e2e` passes against the built API.
   - `pnpm smoke:isolation` passes against the built API.
   - `pnpm smoke:rewards` passes against the built API.
   - `pnpm smoke:ui` passes with a temporary API and Vite frontend process.
   - `pnpm smoke:all` wraps the build and smoke suite in one command.
   - `pnpm smoke:deployment` verifies the deployed Nginx/API split after PM2 and Nginx are running.

6. Import review polish.
   - Import validation flags likely Chinese mojibake from OCR or bad encodings.
   - JSON parse failures include line/column context when available.
   - The import page can focus and filter questions that need attention.
   - Empty Excel/CSV reads produce actionable table/header guidance.
   - Browser smoke coverage now uploads a real `.xlsx` file, imports it, records an Excel batch, and generates a review paper.
   - Import batch detail page shows batch metadata, review-paper status, failure notes, question groups, and type/grade/difficulty/tag statistics.
   - Import batch detail also returns and displays linked knowledge-point distribution for imported groups and questions.

7. Deployment smoke polish.
   - Admin web now supports `VITE_API_BASE_URL`, so production builds can call `/api` through Nginx instead of hard-coded `localhost:3000`.
   - Deployment docs include the public URL smoke command and optional admin login verification.

## Next Feature Work

1. Add richer knowledge-point taxonomy.
2. Add production backup/restore rehearsal docs and smoke commands.

## Operational Notes

- `.env` contains real local runtime credentials. Keep it out of version control and rotate the credential if it has been shared outside this machine.
- Prefer running smoke tests against `node apps/api/dist/main.js` after `pnpm run build` for a stable non-watch test server.
