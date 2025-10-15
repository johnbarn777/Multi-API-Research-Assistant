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

> **Note:** The redirect target was updated from `/` to `/sign-in` to align with the dedicated sign-in route and automated E2E coverage.

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

**Testing**
- ~~Unit: Repository logic using Firebase emulator or mocked Firestore (success + invalid transitions).~~ (Covered via Vitest with an in-memory Firestore double.)
- ~~Integration: Supertest hitting `/api/research` list/create endpoints with emulator to confirm persistence and authorization.~~ (Exercised with Supertest + middleware using an in-memory repository override.)
- E2E: Not yet (no UI dependency).

## Commit 4: Provider abstractions (OpenAI DR & Gemini)

**Implementation Steps**
- Implement `src/lib/providers/openaiDeepResearch.ts` with methods `startSession`, `submitAnswer`, `executeRun`, `pollResult` using fetch with exponential backoff.
- Implement `src/lib/providers/gemini.ts` with `generateContent` and optional polling wrapper.
- Introduce `src/lib/providers/normalizers.ts` to map raw payloads into `ProviderResult` shape.
- Wire configuration to use base URLs/models from env helpers.
- Ensure logging instrumentation via existing logger utility.

**Testing**
- Unit: Vitest tests with MSW/nock to assert request payloads, retry logic, and normalization output for representative provider responses.
- Integration: None (will be covered when APIs invoke providers).
- E2E: Not applicable.

## Commit 5: Research creation API & UI flow start

**Implementation Steps**
- Implement `/api/research` POST route to validate payload, create Firestore doc, call `startSession`, store session/questions, and return JSON.
- Implement `/api/research` GET route for paginated dashboard data using repository.
- Create `/app/research/new/page.tsx` with authenticated form to submit a topic and redirect to detail page.
- Add optimistic UI update to dashboard list via SWR/React Query or simple revalidation.

**Testing**
- Unit: Schema validation tests for create payload; ensure failure when `title` empty or > length.
- Integration: Supertest covering success path (mocking OpenAI) and provider failure fallback to `status: failed` with error message stored.
- E2E: Playwright test for new research creation showing first question (after next commit hooking detail view).

## Commit 6: Refinement loop API + client components

**Implementation Steps**
- Implement `/api/research/[id]/openai/answer` route handling question submission, storing answers, and detecting final prompt transitions.
- Add server action/helper for fetching next question state for UI hydration.
- Build `RefinementQA` component (in `src/components/research/RefinementQA.tsx`) with back/next controls, textarea, and progress indicator.
- Update `app/research/[id]/page.tsx` to render refinement stepper when status is `awaiting_refinements` or `refining`, persisting local answers until saved.

**Testing**
- Unit: Reducer/component logic tests (Vitest + React Testing Library) ensuring navigation retains answers and disables submit until text present.
- Integration: Supertest for answer route (mocking provider) verifying Firestore updates and final prompt status change.
- E2E: Playwright scenario completing multi-question refinement and seeing “Ready to Run” state.

## Commit 7: Parallel provider execution orchestration

**Implementation Steps**
- Add `/api/research/[id]/run` route that transitions status to `running`, triggers OpenAI execute + Gemini generate in parallel (Promise.allSettled) using background tasks (Next.js route handler async).
- Implement polling/backoff helpers to update Firestore with intermediate provider status, durations, errors.
- Update research detail page with `ProviderProgress` component showing state of each provider with streaming updates (e.g., via polling or SWR revalidation).
- Ensure state machine allows partial success and records failure reasons.

**Testing**
- Unit: Tests for orchestration helper ensuring retries, partial failure handling, and status transitions.
- Integration: Supertest hitting `/run` with mocked providers returning success and failure; assert Firestore updates and final state.
- E2E: Playwright test clicking “Run” and observing both provider cards progress to completion.

## Commit 8: PDF generation service

**Implementation Steps**
- Create `src/lib/pdf/builder.ts` using `pdf-lib` to assemble cover page, OpenAI section, Gemini section, metadata footer.
- Implement utility to upload PDF to Firebase Storage (if configured) or return buffer path; update repository to store `report.pdfPath`.
- Add unit-friendly sample data for deterministic PDF output and Byte signature tests.

**Testing**
- Unit: Vitest verifying builder outputs `%PDF` header, includes section titles, and handles missing provider gracefully.
- Integration: Supertest invoking `/api/research/[id]/finalize` with mock data verifying PDF buffer length and storage path recorded.
- E2E: Playwright downloads PDF link and asserts header via API route.

## Commit 9: Email delivery pipeline with Gmail + SendGrid fallback

**Implementation Steps**
- Implement `src/lib/email/gmail.ts` for OAuth token refresh (using stored encrypted token) and RFC822 message assembly with PDF attachment.
- Implement `src/lib/email/sendgrid.ts` fallback sender.
- Create orchestrator in `src/server/email/sendResearchReport.ts` selecting provider based on token validity, recording status and errors.
- Update finalize route to call email sender after PDF build and store `report.emailStatus`, `emailedTo` fields.
- Surface success/error toast/banners on research detail page once email attempt finishes.

**Testing**
- Unit: Tests for Gmail RFC822 builder, fallback selection, token refresh failure leading to SendGrid usage.
- Integration: Supertest for finalize route with Gmail success, Gmail failure + SendGrid success, both fail -> `failed` status.
- E2E: Playwright verifying UI shows “Email sent” or “Email failed” banner based on mocked API response.

## Commit 10: Dashboard & history UX polish

**Implementation Steps**
- Implement dashboard page (`app/dashboard/page.tsx`) listing research sessions via server component fetching `/api/research` with pagination.
- Build `ResearchCard` component with status chip, created date, and navigation link.
- Add empty state, loading skeletons, and responsive layout per UX requirements.
- Ensure routing from `/` to `/dashboard` post-login and sign-out flows.

**Testing**
- Unit: Component snapshot/interaction tests verifying chips, empty states.
- Integration: Supertest verifying pagination query parameters.
- E2E: Playwright test logging in, creating multiple research sessions, and confirming order/status display.

## Commit 11: Observability, error handling, and retries

**Implementation Steps**
- Centralize error envelope helper returning `{ code, message, retryAfterMs? }` for API routes.
- Add exponential backoff utilities reused by provider and email calls; ensure max retry counts per requirement.
- Instrument structured logging in key server paths (research create, answer, run, finalize) including request ID/research ID metadata.
- Document retry/backoff behavior in `docs/architecture.md` updates.

**Testing**
- Unit: Tests for retry helper ensuring delay schedule and abort on non-retryable errors.
- Integration: Supertest simulating provider 5xx responses to confirm retries logged and eventual success/failure matches spec.
- E2E: Not required (covered by previous flows).

## Commit 12: Accessibility, responsiveness, and CI coverage

**Implementation Steps**
- Add Tailwind responsive utilities to key components ensuring mobile layout without overflow, 44px tap targets, and focus outlines.
- Integrate `@axe-core/playwright` into E2E suite for accessibility checks on dashboard and research detail pages.
- Configure GitHub Actions workflow (`.github/workflows/ci.yml`) running lint, typecheck, unit, integration, and Playwright tests.
- Update README with testing commands and CI badge placeholder.

**Testing**
- Unit: None new beyond lint/typecheck.
- Integration: CI workflow ensures `pnpm lint`, `pnpm test`, `pnpm test:integration` pass locally.
- E2E: Playwright mobile viewport test confirming no horizontal scroll; accessibility scan passes.
