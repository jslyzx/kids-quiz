# Kids Quiz Next Work Plan

Last checked: 2026-06-08

## Current Health Check

- `pnpm run build` passes for shared types, question renderer, API, and admin web.
- API health check passes when started from the built entrypoint: `node apps/api/dist/main.js`.
- `pnpm smoke:e2e` passes against a temporary API process.
- `pnpm smoke:isolation` passes and verifies cross-owner and cross-student data isolation.
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
   - Stores catalog and redemption history in the student's JSON settings while keeping star balance in `Student.totalStars`.

4. Deployment package.
   - Adds `.env.production.example`.
   - Adds `docs/deployment.md` with database, upload directory, PM2, Nginx, backup, and release checklist guidance.

5. Regression safety.
   - `pnpm run build` passes.
   - `pnpm smoke:e2e` passes against the built API.
   - `pnpm smoke:isolation` passes against the built API.

## Next Feature Work

1. Add a dedicated database-backed reward catalog/redemption table if redemption reporting needs to become auditable outside student JSON settings.
2. Add UI tests for Excel upload conversion and reward redemption approval.
3. Add deployment smoke checks for a production-like Nginx/API split.

## Operational Notes

- `.env` contains real local runtime credentials. Keep it out of version control and rotate the credential if it has been shared outside this machine.
- Prefer running smoke tests against `node apps/api/dist/main.js` after `pnpm run build` for a stable non-watch test server.
