# Kids Quiz Next Work Plan

Last checked: 2026-06-06

## Current Health Check

- `pnpm run build` passes for shared types, question renderer, API, and admin web.
- API health check passes when started from the built entrypoint: `node apps/api/dist/main.js`.
- `pnpm smoke:e2e` passes against the temporary API process.
- Vite reports one bundle-size warning for the admin web main chunk. This is not blocking, but it is worth addressing before long-term deployment.
- Admin login and JWT protection are now in place for management APIs.
- Parent and child entry points are separated: `/parent/*` requires parent login, while `/` and `/kid/*` remain child-facing.

## Immediate Priority

The project is functionally broad enough now. The next phase should focus on product hardening rather than adding more surface area.

1. Replace hardcoded default owner IDs with request-scoped identity.
2. Add formal `/student/*` APIs and a real student session instead of using public aliases over selected `/admin/*` endpoints.
3. Keep the current build and smoke test green after each change.
4. Then continue with Excel import, report printing, reward redemption, and deployment.

## Auth And Permission Gaps

The schema already has production-oriented fields:

- `User.username`, `User.passwordHash`, `User.role`, `User.status`
- `Student.ownerId`, `Student.pinHash`
- `ownerId` on subjects, knowledge points, question groups, questions, and papers

The API now has the first authentication boundary:

- `AuthModule`, `POST /admin/auth/login`, JWT guard, and login page are implemented.
- Admin controllers under `/admin/*` require `Authorization: Bearer <token>`.
- `/health` remains public.
- Child-facing routes are not blocked by parent login. Selected read/practice endpoints are public for now so the child app can run without a parent token.

Remaining identity gaps:

- Services still use fixed identities such as `DEFAULT_OWNER_ID = 1n`.
- Student-facing behavior is also tied to `DEFAULT_STUDENT_ID = 1n`.
- Frontend API helpers send an auth token, but the backend services do not yet consume request-scoped user IDs.
- Child-facing API paths should be split out from `/admin/*` once student sessions are added.

## Recommended Implementation Order

### 1. Admin Login Baseline - Done

- Add `AuthModule`.
- Add `POST /admin/auth/login`.
- Verify username and password with `bcrypt`.
- Sign a JWT with `sub`, `username`, and `role`.
- Add `JWT_SECRET` and token expiry settings to `.env.example`.
- Seed or upsert the initial admin user in setup flow or a dedicated script.

Acceptance:

- Invalid credentials return `401`.
- Valid credentials return an access token and basic user profile.
- Existing smoke test can still run, either through test login or explicit local test bypass.

### 2. Protect Admin APIs - Done

- Add a JWT guard.
- Apply it to `/admin/question-groups`, `/admin/papers`, `/admin/submissions`, `/admin/student`, and `/admin/uploads`.
- Keep `/health` public.
- Add frontend token storage and an API request wrapper that attaches `Authorization: Bearer <token>`.

Acceptance:

- Calling protected admin endpoints without a token returns `401`.
- The admin web can log in and continue the existing workflows.
- Build and smoke test remain green.

### 3. Request-Scoped Owner ID - Next

- Replace service-level `DEFAULT_OWNER_ID` writes and filters with the authenticated user's `id`.
- Ensure list/detail/update/delete operations filter by `ownerId`.
- Keep a local development fallback only if explicitly enabled by environment, not by default.

Acceptance:

- User A cannot read or mutate User B's question groups, papers, students, or reports.
- Existing single-user local data still works after migration or fallback setup.

### 4. Student Session And Student APIs

- Add a lightweight student session flow.
- Move child-facing reads and submissions to `/student/*` or `/public/*` endpoints.
- Use `Student.pinHash` only when PIN is enabled.
- Pass the resolved student ID into submissions, wrong-book queries, rewards, tasks, and reports.

Acceptance:

- Multiple students under the same owner can have independent attempts, wrong books, rewards, and reports.
- The old `DEFAULT_STUDENT_ID` path is removed or limited to test fixtures.

## Next Feature Work After Hardening

1. Excel import, reusing the existing JSON import validation and preview pipeline.
2. Learning report printing, matching the existing paper and wrong-question print UX.
3. Star reward redemption, with reward catalog, redemption records, and parent confirmation.
4. Deployment package: production env template, Nginx or PM2 instructions, upload directory policy, database migration and backup procedure.

## Operational Notes

- `.env` contains real local runtime credentials. Keep it out of version control and rotate the credential if it has been shared outside the machine.
- Prefer running smoke tests against `node apps/api/dist/main.js` after `pnpm run build` for a stable non-watch test server.
