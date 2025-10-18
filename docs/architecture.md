# Architecture Overview

## High-Level Flow

1. **Authentication** – User signs in with Google via Firebase Auth. Middleware attaches the Firebase UID to every server request.
2. **Research Creation** – Client calls `/api/research` to create a Firestore document (defaults to `awaiting_refinements`, immediately transitions to `refining` when the provider returns questions) and start the OpenAI Deep Research session.
3. **Refinement Loop** – UI surfaces one question at a time. Answers are posted to `/api/research/:id/openai/answer`, which now persists `{index, answer}` pairs, appends provider follow-ups, and transitions the research to `ready_to_run` once `finalPrompt` arrives. The client uses `hydrateRefinementState` (server action) plus the `RefinementQA` component to retain local drafts across navigation while the state machine advances.
4. **Parallel Execution** – `/api/research/:id/run` (`scheduleResearchRun`) transitions the doc to `running`, then kicks off OpenAI Deep Research and Gemini in parallel using `Promise.all`. Each provider sets its own `status`, `startedAt`, `completedAt`, `durationMs`, `result`, and `error` as it settles so partial success is recorded. The research status flips to `completed` when at least one provider succeeds; otherwise it becomes `failed`.
5. **Finalization** – `/api/research/:id/finalize` builds the comparative PDF via `pdf-lib`, persists it to Firebase Storage when `FIREBASE_STORAGE_BUCKET` is available (otherwise exposes an in-memory `buffer://` path), records `report.pdfPath`, then invokes `sendResearchReportEmail`. The email orchestrator refreshes Gmail OAuth tokens when possible, falls back to SendGrid on authentication/network failures, and stamps `report.emailStatus`, `report.emailedTo`, and `report.emailError` accordingly so the UI can surface delivery banners immediately. The run orchestrator now invokes this finalize pipeline automatically whenever a session completes successfully, fetching the owner’s email from the user repository so report delivery happens without extra UI steps (the API route remains available for manual retries). If a stored profile email is missing, the pipeline reuses the session email supplied with the run request or, in demo mode, generates a deterministic `demo-user+<uid>@example.com` fallback recipient so delivery never blocks the flow.
   When clients append `?skipEmail=true` (or the equivalent `X-Email-Skipped` header), the finalize route still rebuilds the PDF but bypasses email delivery—used by the “Download report” button so users can retrieve the file even when Gmail credentials are unavailable.

The research detail view exposes explicit retry controls: failed provider executions surface a “Retry run” button, email delivery failures expose “Retry email delivery”, and the creation form provides a retry affordance alongside error messaging so demo operators can recover without reloading.
The same view now also exposes a “Download report PDF” action that calls the finalize route with email skipped, providing an immediate fallback when automated delivery fails.

## Directory Responsibilities

- `app/` – Next.js routes. UI pages and REST-like API endpoints.
- `src/components/` – Reusable presentational components (cards, progress indicators, refinement UI).
- `src/config/` – Environment parsing and validation.
- `src/lib/` – Provider wrappers, response normalizers, Firebase helpers, utilities for PDF/email/logging.
- `src/lib/pdf/` – Report builder and storage utilities shared by the finalize pipeline.
- `src/lib/api/` – Lightweight client-side fetch helpers shared across pages/components.
- `src/lib/security/` – Encryption helpers for Gmail OAuth tokens and future secret utilities.
- `src/hooks/` – Client hooks (e.g., SWR-powered research list subscription) that wrap shared fetch helpers.
- `src/server/` – Orchestration logic and state machine enforcing valid status transitions.
- `src/server/repositories/` – Firestore data access layer containing strongly-typed repositories for research and user documents.
- `src/tests/` – Shared mocks (MSW, Firebase emulators) reuseable across test suites.
- `tests/` – Unit, integration, and E2E test entry points.

## Authentication & Session Handling

- `middleware.ts` executes on every request (except public paths) and verifies Firebase ID tokens supplied via `Authorization: Bearer`, `x-firebase-id-token`, or supported session cookies. The middleware performs verification via Firebase's Identity Toolkit REST API so it can run inside the Edge runtime (avoiding the `firebase-admin` Node dependency). When verification succeeds it injects `x-user-uid`, `x-user-email`, and `x-firebase-id-token` headers before forwarding the request.
- API routes leverage `src/server/auth/session.ts` helpers (`ensureAuthenticated`, `requireAuth`) to read the injected headers and short-circuit unauthorized calls with a `401` JSON response.
- Page requests without valid credentials are redirected to `/sign-in?redirectedFrom=<path>`.
- The root route is no longer public; `app/page.tsx` performs a server-side redirect to `/dashboard` for authenticated users, while unauthenticated visitors are diverted to `/sign-in` by the middleware.
- The React tree is wrapped with `AuthProvider` from `src/lib/firebase/auth-context.tsx` so client components can call `useAuth()` for loading state, the current Firebase user, and the latest ID token.
- `AuthProvider` mirrors refreshed ID tokens into a `firebaseToken` cookie (1-hour max-age, `SameSite=Strict`) so middleware can authenticate soft navigations without extra API calls.
- `/sign-in` uses `signInWithPopup` with the Firebase Google provider, enforcing `browserLocalPersistence` and redirecting to the `redirectedFrom` query param or `/dashboard` (also used when redirecting from `/`) after success.
- Local development can opt into a synthetic session by setting `DEV_AUTH_BYPASS=true` (and optional UID/email overrides). When active in non-production environments, the middleware injects those headers without hitting Firebase so `pnpm dev` can render authenticated pages.
- A global `AppHeader` client component renders on every route, surfacing the current auth state via `UserMenu`. This control now exposes a skip link to `#main-content`, maintains 44px tap targets, provides a direct link back to `/sign-in` when unauthenticated, and invokes Firebase `signOut` before redirecting to `/sign-in` so demo sessions can be closed explicitly.

## Data Access Layer

- `FirestoreResearchRepository` owns conversions between Firestore documents and `Research` domain models, enforces the state machine (`awaiting_refinements → refining → ready_to_run → running → completed|failed`), and guarantees pagination stability using a base64 cursor that captures the `createdAt` timestamp + document id.
- Repositories merge nested provider/report sub-objects safely and always stamp `createdAt`/`updatedAt` timestamps server-side.
- `FirestoreUserRepository` persists Gmail OAuth token payloads alongside user profile metadata, allowing secure token refresh flows.
- Repository instances are singletons by default, but tests can override them with in-memory doubles via `setResearchRepository`/`setUserRepository`.

## Client Data Fetching & Optimistic UI

- `app/dashboard/page.tsx` is a server component that calls `/api/research` with the authenticated request headers. It renders loading skeletons via `app/dashboard/loading.tsx`, surfaces empty/error states, and honours pagination through querystring cursors. Non-production environments can supply a base64-encoded `__dashboard_fixture` cookie to inject fixture data for automated tests without touching production behaviour.
- `app/dashboard/page.tsx` is a server component that calls `/api/research` with the authenticated request headers. It renders loading skeletons via `app/dashboard/loading.tsx`, surfaces empty/error states, and honours pagination through querystring cursors. Non-production environments can supply a base64-encoded `__dashboard_fixture` cookie to inject fixture data for automated tests without touching production behaviour. It pairs with `ResearchCardList` to maintain 44px tap targets, skip-link focus management, and responsive layouts validated at 375px width via Playwright + axe-core.
- `useResearchList` remains available for client flows (e.g., optimistic cache updates after creation) and still exposes `mutate` alongside the default page size of 20.
- Creating a research session calls `createResearch` helper, then prepends the returned item to the SWR cache before revalidating in the background.
- Research detail views rely on `useResearchDetail`, fetching `/api/research/:id` to surface the latest refinement questions immediately after creation. The hook now refreshes every ~2.5s while a run is `running` so provider progress badges update without a manual reload.
- Errors from `/api/research` surface through a shared `ApiError` class so UI components can render consistent messaging.

## Deployment Considerations

- **Vercel Edge** for UI routes without heavy dependencies.
- **Node runtime** (Vercel Serverless Function) for provider calls, PDF generation, and email sending.
- **Secrets** via Vercel environment variables. Gmail OAuth tokens should be encrypted (see `TOKEN_ENCRYPTION_KEY`).
- Environment helpers (`getServerEnv` / `getPublicEnv`) ensure server secrets stay off the client bundle while still validating configuration with Zod.
- **Firestore Indexes** – `research` collection indexes `(ownerUid ASC, createdAt DESC, __name__ DESC)` via `firestore.indexes.json` (deployed 2025-10-15).
- **Firestore Rules** – `firestore.rules` locks access to authenticated users’ own `users/{uid}` and `research/{id}` documents; deployed with the CLI alongside indexes on 2025-10-15.
- **Analytics** – `getClientAnalytics()` lazily loads Firebase Analytics once the browser environment is ready and a measurement ID is supplied.
- **CI** – `.github/workflows/ci.yml` runs lint, type-check, Vitest (unit/integration), and Playwright (including axe-core audits) on pushes and pull requests.
- **Playwright binaries** – Browser downloads are skipped when `CI`, `VERCEL`, or `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set. Run `pnpm playwright:install` locally before executing E2E tests to ensure the binaries exist.

## Demo Mode

- `DEMO_MODE=true` replaces live provider calls with deterministic fixtures defined in `src/lib/demo/demoFixtures.ts`. Refinement questions and final prompts are generated from the research topic and prior answers so the state machine behaves exactly as production.
- Provider runs (`scheduleResearchRun`) short-circuit to fixture results, logging `research.run.*.demo` entries and avoiding OpenAI/Gemini network usage while still updating Firestore with success states and normalized payloads.
- Provider state resets strip `undefined` values before writes so Firestore never rejects demo runs (e.g., `dr.completedAt` now remains unset instead of `undefined`), keeping the workflow compatible with both emulator and production projects.
- Demo email delivery falls back to a deterministic `demo-user+<uid>@example.com` recipient when no profile email is stored, so retrying the pipeline never requires real Gmail credentials.
- Legacy research documents that are missing provider sub-documents are normalized on write: merge operations start from an idle state so hydration never crashes when `dr`/`gemini` is absent in older fixtures.
- Email delivery returns a synthetic message id, logs the preview, marks `report.emailStatus=sent`, and exposes the rendered body via `X-Email-Preview-Base64` for demo tooling. Gmail/SendGrid/Tokens remain untouched.
- PDF persistence skips Firebase Storage while the flag is set, returning a `demo://` path that downstream consumers can surface without depending on GCS.
- The flag defaults to `false`; unset to re-enable production integrations for end-to-end testing.

## Observability

- Structured JSON logging (`src/lib/utils/logger.ts`) to pipe context (request id, research id, provider). `resolveRequestId`
  extracts/creates correlation IDs and API responses echo them via `X-Request-Id` using `withRequestId`.
- Provider integrations emit `provider.request.*` and `gemini.generate.*` logs around retries/poll attempts so transient
  failures are traceable; exponential backoff (max 3 attempts per HTTP request) is centralized in `src/lib/utils/retry.ts` and
  reused by OpenAI, Gemini, and Gmail delivery.
- API routes return a consistent `{ code, message, retryAfterMs?, requestId }` envelope via `src/server/http/jsonError.ts`.
- Surface metrics (counts by status, duration averages) using a future instrumentation layer or third-party service.

## TODO Highlights

- Verify Firebase Auth session validation end-to-end against the deployed Firestore rules.
- Integrate OpenAI Deep Research & Gemini using provider utilities.
- Continue iterating on PDF layout polish (typography, spacing, optional tables) in `src/lib/pdf/builder.ts`.
- Monitor Gmail + SendGrid delivery telemetry and tune retry thresholds as we collect production data.
- Add full coverage tests referencing requirement matrix in the project brief.
