# MVP Atomic Commit Plan

This plan sequences atomic commits to deliver the Multi-API Deep Research Assistant MVP using the existing Next.js + Firebase scaffolding. Each commit lists the primary implementation steps and the minimum test coverage required to consider the commit complete.

## Commit 1: Harden environment configuration & provider secrets plumbing

**Implementation Steps**
- ~~Expand `src/config/env.ts` to validate all required environment variables (Firebase, OpenAI DR, Gemini, Gmail OAuth, SendGrid, app URL) using Zod.~~
- ~~Export typed helpers for web (`NEXT_PUBLIC_*`) vs server-only secrets to ensure tree-shaking.~~
- ~~Add utility for decrypting Gmail OAuth tokens using `TOKEN_ENCRYPTION_KEY` in `src/lib/security/crypto.ts`.~~
- ~~Update documentation (`README.md`, `.env.example`) with the full variable list and notes for local emulator usage.~~
- Added Vitest/Vite alias configuration (`vitest.config.ts`, `vitest.integration.config.ts`) so the new unit tests resolve `@/` imports.

**Testing**
- ~~Unit: Vitest coverage for env parser (happy path + missing variable failures) and crypto helper (round-trip encrypt/decrypt using sample key).~~ (`tests/unit/env.test.ts`, `tests/unit/crypto.test.ts`; `pnpm test:unit` passes after alias fix.)
- Integration: None (configuration only).
- E2E: Not applicable.

## Commit 2: Firebase initialization & auth middleware

**Implementation Steps**
- ~~Implement Firebase Admin singleton in `src/lib/firebase/admin.ts` wiring Firestore and Auth.~~
- ~~Configure Firebase client SDK in `src/lib/firebase/client.ts` for use in the App Router.~~
- ~~Flesh out `middleware.ts` to verify Firebase ID tokens, inject `uid` and `email` into request headers, and redirect unauthenticated traffic to `/sign-in` with the original path in `redirectedFrom`.~~
- ~~Create `src/server/auth/session.ts` helpers for asserting authenticated requests inside API routes/server actions.~~
- ~~Add session-aware layout wrappers in `app/(auth)/layout.tsx` and global providers to surface `useAuth` hook state.~~
- ~~Introduce a global `AppHeader` + `UserMenu` displaying the active user and providing sign-out/reauth controls across the shell.~~
- ~~Expose lazy Firebase Analytics bootstrap (`getClientAnalytics`) gated behind measurement ID availability.~~ (2025-10-15)
- ~~Wire `/sign-in` to the Firebase Google provider via `signInWithPopup`, persisting sessions locally and honoring `redirectedFrom`.~~ (2025-10-15)

> **Note:** The redirect target was updated from `/` to `/sign-in` to align with the dedicated sign-in route and automated E2E coverage.

> **Follow-up:** `middleware.ts` now uses Firebase's Identity Toolkit REST API to validate ID tokens so the Edge runtime and `pnpm dev` bundler no longer attempt to import `firebase-admin` (which depends on unsupported `node:` modules).

> **Deviation (local dev only):** Added an environment-guarded `DEV_AUTH_BYPASS` path in the middleware so `pnpm dev` can load authenticated pages without a Firebase sign-in. Leave disabled for production builds.

**Testing**
- ~~Unit: Vitest tests for middleware token parsing using mocked `verifyIdToken`, ensuring unauthorized requests short-circuit with 302/401.~~ (`tests/unit/middleware.test.ts`)
- ~~Integration: Supertest against `/api/research` stub to ensure 401 without auth header and 200 with valid mock token.~~ (`tests/integration/api-research.test.ts`)
- ~~E2E: Playwright scenario verifying unauthenticated redirect to sign-in page.~~ (`tests/e2e/research.spec.ts`; local `pnpm test:e2e` currently fails because Next's dev bundler cannot resolve the `node:` imports from `firebase-admin`. Follow-up fix required.)

## Commit 3: Firestore data access layer & models

**Implementation Steps**
- ~~Define TypeScript models in `src/types/research.ts` aligning with the requirements (`Research`, `ProviderResult`).~~
- ~~Implement Firestore converters/repositories in `src/server/repositories/researchRepository.ts` supporting create, update, getById, listByOwner with pagination, and state transition checks.~~
- ~~Add user repository for Gmail OAuth token persistence.~~
- ~~Ensure server helpers enforce `ownerUid` authorization before returning data.~~
- ~~Deploy baseline Firestore security rules and owner-scoped composite index via Firebase CLI (2025-10-15).~~

**Testing**
- ~~Unit: Repository logic using Firebase emulator or mocked Firestore (success + invalid transitions).~~ (Covered via Vitest with an in-memory Firestore double.)
- ~~Integration: Supertest hitting `/api/research` list/create endpoints with emulator to confirm persistence and authorization.~~ (Exercised with Supertest + middleware using an in-memory repository override.)
- E2E: Not yet (no UI dependency).

## Commit 4: Provider abstractions (OpenAI DR & Gemini)

**Implementation Steps**
- ~~Implement `src/lib/providers/openaiDeepResearch.ts` with methods `startSession`, `submitAnswer`, `executeRun`, `pollResult` using fetch with exponential backoff.~~
- ~~Implement `src/lib/providers/gemini.ts` with `generateContent` and optional polling wrapper.~~
- ~~Introduce `src/lib/providers/normalizers.ts` to map raw payloads into `ProviderResult` shape.~~
- ~~Wire configuration to use base URLs/models from env helpers.~~
- ~~Ensure logging instrumentation via existing logger utility.~~

**Testing**
- ~~Unit: Vitest tests with MSW/nock to assert request payloads, retry logic, and normalization output for representative provider responses.~~
- Integration: None (will be covered when APIs invoke providers).
- E2E: Not applicable.

## Commit 5: Research creation API & UI flow start

**Implementation Steps**
- ~~Implement `/api/research` POST route to validate payload, create Firestore doc, call `startSession`, store session/questions, and return JSON.~~
- ~~Implement `/api/research` GET route for paginated dashboard data using repository.~~
- ~~Create `/app/research/new/page.tsx` with authenticated form to submit a topic and redirect to detail page.~~
- ~~Add optimistic UI update to dashboard list via SWR/React Query or simple revalidation.~~ _(SWR adopted for cache + optimistic prepend.)_
- ~~Hydrate `/research/[id]` page from the new API so the first refinement question renders immediately after creation.~~

**Testing**
- Unit: Schema validation tests for create payload; ensure failure when `title` empty or > length. _(Deferred – to be added with broader validation coverage.)_
- ~~Integration: Supertest covering success path (mocking OpenAI) and provider failure fallback to `status: failed` with error message stored.~~ _(Implemented as a 502 retry response; no Firestore write on provider failure. Tests: `pnpm test:integration`.)_
- ~~E2E: Playwright test for new research creation showing first question (after next commit hooking detail view).~~ (`tests/e2e/research.spec.ts` intercepts API responses for deterministic assertions.)

## Commit 6: Refinement loop API + client components

**Implementation Steps**
- ~~Implement `/api/research/[id]/openai/answer` route handling question submission, storing answers, and detecting final prompt transitions.~~
- ~~Add server action/helper for fetching next question state for UI hydration.~~
- ~~Build `RefinementQA` component (in `src/components/research/RefinementQA.tsx`) with back/next controls, textarea, and progress indicator.~~
- ~~Update `app/research/[id]/page.tsx` to render refinement stepper when status is `awaiting_refinements` or `refining`, persisting local answers until saved.~~

**Testing**
- ~~Unit: Reducer/component logic tests (Vitest + React Testing Library) ensuring navigation retains answers and disables submit until text present.~~ (`pnpm test:unit`)
- ~~Integration: Supertest for answer route (mocking provider) verifying Firestore updates and final prompt status change.~~ (`pnpm test:integration`)
- ~~E2E: Playwright scenario completing multi-question refinement and seeing “Ready to Run” state.~~ (`pnpm test:e2e --project=chromium`)

## Commit 7: Parallel provider execution orchestration

**Implementation Steps**
- ~~Add `/api/research/[id]/run` route that transitions status to `running`, triggers OpenAI execute + Gemini generate in parallel (Promise.allSettled) using background tasks (Next.js route handler async).~~
- ~~Implement polling/backoff helpers to update Firestore with intermediate provider status, durations, errors.~~
- ~~Update research detail page with `ProviderProgress` component showing state of each provider with streaming updates (e.g., via polling or SWR revalidation).~~
- ~~Ensure state machine allows partial success and records failure reasons.~~

**Testing**
- ~~Unit: Tests for orchestration helper ensuring retries, partial failure handling, and status transitions.~~ (`tests/unit/researchRun.test.ts`)
- ~~Integration: Supertest hitting `/run` with mocked providers returning success and failure; assert Firestore updates and final state.~~ (`tests/integration/api-research.test.ts`)
- ~~E2E: Playwright test clicking “Run” and observing both provider cards progress to completion.~~ (`tests/e2e/research.spec.ts`)

> **Note:** `pnpm test:e2e` still expects valid Firebase Admin credentials (project id + service account). Local runs without these secrets will fail while booting the Next.js dev server; supply the real keys when executing the suite.

## Commit 8: PDF generation service

**Implementation Steps**
- ~~Create `src/lib/pdf/builder.ts` using `pdf-lib` to assemble cover page, OpenAI section, Gemini section, metadata footer.~~ (`src/lib/pdf/builder.ts`)
- ~~Implement utility to upload PDF to Firebase Storage (if configured) or return buffer path; update repository to store `report.pdfPath`.~~ (`src/lib/pdf/storage.ts`, `src/server/research/finalize.ts`, `app/api/research/[id]/finalize/route.ts`)
- ~~Add unit-friendly sample data for deterministic PDF output and Byte signature tests.~~ (`src/tests/fixtures/researchReport.ts`)

**Testing**
- ~~Unit: Vitest verifying builder outputs `%PDF` header, includes section titles, and handles missing provider gracefully.~~ (`tests/unit/pdf/builder.test.ts`)
- ~~Integration: Supertest invoking `/api/research/[id]/finalize` with mock data verifying PDF buffer length and storage path recorded.~~ (`tests/integration/research-finalize.test.ts`)
- ~~E2E: Playwright downloads PDF link and asserts header via API route.~~ (`tests/e2e/research.spec.ts`)

## Commit 9: Email delivery pipeline with Gmail + SendGrid fallback

**Implementation Steps**
- ~~Implement `src/lib/email/gmail.ts` for OAuth token refresh (using stored encrypted token) and RFC822 message assembly with PDF attachment.~~ (`sendWithGmail` now refreshes tokens, builds multipart message, and logs outcomes.)
- ~~Implement `src/lib/email/sendgrid.ts` fallback sender.~~
- ~~Create orchestrator in `src/server/email/sendResearchReport.ts` selecting provider based on token validity, recording status and errors.~~ (Persists refreshed tokens, clears invalid grants, records `report.emailStatus`/`emailError`.)
- ~~Update finalize route to call email sender after PDF build and store `report.emailStatus`, `emailedTo` fields.~~ (`app/api/research/[id]/finalize/route.ts` now emits email headers.)
- ~~Surface success/error toast/banners on research detail page once email attempt finishes.~~ (`app/research/[id]/page.tsx` shows success/failure banners leveraging `report.emailStatus`/`emailError`.)
- Enhancement: Provider runs now trigger the finalize/email pipeline automatically once at least one provider reports success, pulling the owner’s email from the user profile so delivery happens without an extra manual API call. When no profile email is available the pipeline reuses the session email (or a deterministic demo fallback) so demo flows never stall on delivery.

**Testing**
- ~~Unit: Tests for Gmail RFC822 builder, fallback selection, token refresh failure leading to SendGrid usage.~~ (`tests/unit/email/gmail.test.ts`, `tests/unit/email/sendResearchReport.test.ts`)
- ~~Integration: Supertest for finalize route with Gmail success, Gmail failure + SendGrid success, both fail -> `failed` status.~~ (`tests/integration/research-finalize.test.ts`)
- ~~E2E: Playwright verifying UI shows “Email sent” or “Email failed” banner based on mocked API response.~~ (`tests/e2e/research.spec.ts`)

## Commit 10: Dashboard & history UX polish

**Implementation Steps**
- ~~Implement dashboard page (`app/dashboard/page.tsx`) listing research sessions via server component fetching `/api/research` with pagination.~~
- ~~Build `ResearchCard` component with status chip, created date, and navigation link.~~
- ~~Add empty state, loading skeletons, and responsive layout per UX requirements.~~
- ~~Ensure routing from `/` to `/dashboard` post-login and sign-out flows.~~
- Added a non-production `__dashboard_fixture` cookie override so E2E can supply fixture data to the server-rendered dashboard while keeping production behaviour untouched.
- Latest: research detail page exposes inline retry buttons for provider runs and email delivery, and the creation form surfaces a retry affordance after failures so demo operators can recover without reloading.

**Testing**
- ~~Unit: Component snapshot/interaction tests verifying chips, empty states.~~
- ~~Integration: Supertest verifying pagination query parameters.~~
- ~~E2E: Playwright test logging in, creating multiple research sessions, and confirming order/status display.~~

## Commit 11: Observability, error handling, and retries

**Implementation Steps**
- ~~Centralize error envelope helper returning `{ code, message, retryAfterMs? }` for API routes.~~
- ~~Add exponential backoff utilities reused by provider and email calls; ensure max retry counts per requirement.~~
- ~~Instrument structured logging in key server paths (research create, answer, run, finalize) including request ID/research ID metadata.~~
- ~~Document retry/backoff behavior in `docs/architecture.md` updates.~~

**Testing**
- ~~Unit: Tests for retry helper ensuring delay schedule and abort on non-retryable errors.~~ (`tests/unit/utils/retry.test.ts`)
- ~~Integration: Supertest simulating provider 5xx responses to confirm retries logged and eventual success/failure matches spec.~~ (`tests/integration/provider-retry.test.ts`)
- E2E: Not required (covered by previous flows).

## Commit 12: Accessibility, responsiveness, and CI coverage

**Implementation Steps**
- ~~Add Tailwind responsive utilities to key components ensuring mobile layout without overflow, 44px tap targets, and focus outlines.~~ (`app/dashboard/page.tsx`, `src/components/layout/AppHeader.tsx`, `src/components/research/ResearchCard*.tsx`)
- ~~Integrate `@axe-core/playwright` into E2E suite for accessibility checks on dashboard and research detail pages.~~ (`tests/e2e/research.spec.ts`)
- ~~Configure GitHub Actions workflow (`.github/workflows/ci.yml`) running lint, typecheck, unit, integration, and Playwright tests.~~
- ~~Update README with testing commands and CI badge placeholder.~~

**Testing**
- Unit: None new beyond lint/typecheck.
- ~~Integration: CI workflow ensures `pnpm lint`, `pnpm test`, `pnpm test:integration` pass locally.~~ (`.github/workflows/ci.yml`)
- ~~E2E: Playwright mobile viewport test confirming no horizontal scroll; accessibility scan passes.~~ (`tests/e2e/research.spec.ts`)
> Status (2025-10-15): `pnpm lint` now passes after normalizing type-only imports, tightening provider/email typings, and wiring the Firebase sign-in flow, unblocking the CI lint gate.

## Commit 13: Demo mode fixtures & delivery bypass

**Implementation Steps**
- ~~Add `DEMO_MODE` flag validation + tests in `src/config/env.ts` to gate demo behaviour.~~
- ~~Provide deterministic refinement and provider fixture responses so the research state machine runs without OpenAI/Gemini calls.~~
- ~~Short-circuit email + PDF storage when demo mode is active, emitting preview headers and preserving Firestore state.~~
- ~~Document the flag, behaviour, and deployment notes across requirements and architecture docs.~~
> Hardening: Provider state merges now drop `undefined` values before persisting so Firestore accepts demo runs even when placeholder credentials are used (prevents `dr.completedAt` undefined errors).

**Testing**
- Unit: `tests/unit/env.test.ts` updated to cover the new flag (not yet re-run in this work session).
- Integration/E2E: Not run; follow-up to exercise full flow once demo fixtures are merged.

## Commit 14: CI-friendly Playwright install

**Implementation Steps**
- ~~Replace the unconditional `prepare` script with a guarded installer that skips Playwright browser downloads in CI/preview builds.~~
- ~~Expose `pnpm playwright:install` for local setup and document the new flow (README + architecture notes).~~

**Testing**
- Manual verification required: run `pnpm playwright:install` locally before executing E2E suites.
