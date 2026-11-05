# Week 7 Test and Security Report

## Summary

Week 7 automated verification and security work is implemented. The backend test suite, frontend production build, Chrome browser suite, and both frontend/backend dependency audits completed successfully.

**Release status: Conditional release candidate.** The automated checks pass, but the HTTP API tests use in-memory Mongoose model stubs. A live MongoDB Atlas deployment smoke test (including replica-set transactions) and deployment-specific email delivery checks were not run, so this report does not certify those integrations.

## Test cases and results

| Area | Test case | Expected result | Actual result | Status |
|---|---|---|---|---|
| Authentication | Register, normalize email, hash password, issue cookie/JWT, login, and reject invalid/duplicate credentials | Valid registration/login succeed; stored password is hashed; invalid credentials receive safe 400/401/409 responses | Assertions passed, including bcrypt comparison and JWT verification | PASS |
| Authentication | Request a protected resource without credentials or with an expired token | Return 401; do not expose protected data | Missing and expired credentials returned 401 | PASS |
| Personal tasks | Create, list, retrieve, update, and delete tasks; reject empty titles, invalid dates, and malformed IDs | Valid CRUD succeeds; invalid input returns 400; another user's task is hidden | HTTP route assertions passed; cross-user task lookup returned 404 | PASS |
| Projects and membership | Create/list projects, reject client-supplied ownership, hide private projects, and restrict member/viewer management | Ownership comes from the authenticated user; private project data is not disclosed; unauthorized changes are denied | Assertions passed, including private-project and role checks | PASS |
| Comments | Create/list comments, verify author identity and enforce project-role and private-task scope | Authorized comments are returned with the author; unauthorized actions/data are denied | HTTP comment and role assertions passed | PASS |
| Notifications | List, mark read, and delete notifications while checking user ownership | Only the authenticated user's records change or appear | Assertions passed; attempts to read another user's notification returned 404 | PASS |
| Calendar and deadlines | Verify calendar task scoping, deadline windows, eligible assignees, completed-task handling, and deduplication keys | Only accessible tasks and eligible recipients are returned; each task/deadline/stage has a stable deduplication key | Calendar route and reminder unit assertions passed | PASS |
| Request validation | Send malformed JSON, JSON larger than 50 KB, invalid email/date/ID, and unsupported fields | Return sanitized 400/413 errors without stack or database details | 400/413 responses and generic 500 response assertions passed | PASS |
| API security | Check security headers and repeated login throttling | Disable Express identification header, return security headers, and rate-limit authentication attempts | Header assertions passed; repeated attempts returned 429 after the configured threshold | PASS |
| Browser authentication | Visit a protected calendar without authentication and submit invalid login details | Redirect to login; show a safe error without server details | Both Chrome browser tests passed | PASS |
| Calendar UI | Render a due task and navigate between months | Task and month navigation remain usable | Chrome browser test passed | PASS |
| Responsive UI | Inspect calendar/navigation at 1440×900, 768×1024, and 390×844 | Main navigation and calendar remain visible without document-level horizontal overflow | All three viewport checks passed | PASS |

### Executed validation

| Command | Result |
|---|---|
| `backend: npm test` | 44 passed, 0 failed |
| `frontend: npm run build` | TypeScript check and Vite production build succeeded |
| `frontend: npm run test:e2e` | 4 passed, 0 failed, using installed Google Chrome |
| `backend: npm audit` | 0 vulnerabilities |
| `backend: npm audit --omit=dev` | 0 vulnerabilities |
| `frontend: npm audit` | 0 vulnerabilities |
| `frontend: npm audit --omit=dev` | 0 vulnerabilities |
| `npm exec nodemon -- --version` | 3.1.11 |
| `git diff --check` | Passed |

## Security checks

- Password hashing and verification were exercised through the registration/login HTTP flow.
- Missing and expired JWTs were rejected; protected routes require authentication.
- Ownership scoping was exercised for personal tasks, private projects, comments, and notifications.
- Project role checks covered restricted membership management and read-only viewer behavior; existing unit tests cover owner/admin/member/viewer role rules and task assignment helpers.
- Registration/login are limited to 10 attempts per IP per 15 minutes. The limiter currently uses its in-memory store; configure a shared store before deploying multiple API instances.
- Helmet security headers are enabled, `X-Powered-By` is disabled, JSON requests are capped at 50 KB, and malformed/oversized request errors are sanitized.
- Full and production-only dependency audits for both backend and frontend reported zero known vulnerabilities. The backend development-only `nodemon` dependency is pinned to 3.1.11 to avoid the prior transitive `minimatch` advisory.
- No credentials or live database connection details were included in tests or this report.

## Bugs found and fixes

1. **Mobile horizontal overflow:** Chrome testing at 390 px exposed overflow from the responsive app grid/sidebar and calendar toolbar. Grid sizing, sidebar scrolling, and toolbar wrapping were corrected; desktop, tablet, and phone checks now pass.
2. **Duplicate controller export:** Removed a duplicate `canMemberUpdateProjectTask` export from the project controller.
3. **Request hardening gaps:** Added Helmet, authentication rate limiting, a 50 KB JSON limit, and sanitized malformed/oversized JSON responses.
4. **Testability without starting MongoDB:** Extracted Express app construction from the database-startup entry point, enabling real HTTP route/controller/middleware tests without triggering a database connection.
5. **Development dependency advisory:** Pinned `nodemon` to 3.1.11; backend audit now reports zero vulnerabilities.

## Scope and limitations

- HTTP integration tests exercise the real Express routes, controllers, and middleware, but replace Mongoose model operations with in-memory stubs. They are not database integration tests.
- MongoDB Atlas connectivity, transaction behavior against a live replica set, SMTP delivery, and a production deployment were not tested.
- Browser tests use local API fixtures and the installed Chrome browser. They do not validate live backend/browser integration.
- The authentication rate limiter is process-local; multi-instance deployments need a shared limiter store.
- No failures remain in the checks listed above. Complete a live-database and deployment smoke test before treating this as a production-certified release.

## Changed files

| File | Change |
|---|---|
| `.gitignore` | Ignore Playwright result and report output directories. |
| `backend/README.md` | Document Week 7 security controls, validation commands, and test limitations. |
| `backend/app.js` | Build and export the reusable Express app; add Helmet, body-size limit, and safe parser error handling. |
| `backend/controllers/projectController.js` | Remove the duplicate helper export. |
| `backend/middleware/authRateLimit.js` | Configure the shared registration/login rate limiter. |
| `backend/package.json`, `backend/package-lock.json` | Add Helmet and rate limiting; pin the patched development nodemon version. |
| `backend/routes/authRoutes.js` | Apply the limiter to registration and login routes. |
| `backend/server.js` | Use the extracted app and only start database/server work when invoked directly. |
| `backend/test/api.integration.test.js` | Add HTTP tests for authentication, CRUD, authorization, validation, notifications, calendar, and security behavior. |
| `frontend/package.json`, `frontend/package-lock.json` | Add Playwright and the `test:e2e` command. |
| `frontend/playwright.config.ts` | Configure Chrome browser tests and the local Vite server. |
| `frontend/e2e/auth.spec.ts` | Test protected-route behavior and safe login errors. |
| `frontend/e2e/calendar.spec.ts` | Test calendar rendering and month navigation. |
| `frontend/e2e/responsive.spec.ts` | Test desktop/tablet/mobile calendar layout and overflow. |
| `frontend/e2e/testHelpers.ts` | Provide deterministic browser API fixtures. |
| `frontend/src/style.css` | Fix responsive grid, sidebar, and toolbar overflow. |
| `Week7_Test_Report.md` | Record test evidence, security checks, changes, and release limitations. |

## Commands to run

From PowerShell:

```powershell
Set-Location D:\task-manager\backend
npm test
npm audit
npm audit --omit=dev
```

```powershell
Set-Location D:\task-manager\frontend
npm run build
npm run test:e2e
npm audit
npm audit --omit=dev
```

The browser suite requires Google Chrome to be installed. The backend test suite does not require MongoDB; separately start the backend with a valid local environment and verify database-dependent workflows against the intended Atlas deployment.
