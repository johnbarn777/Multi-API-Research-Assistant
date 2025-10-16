# Architecture Overview

## High-Level Flow

1. **Authentication** – User signs in with Google via Firebase Auth. Middleware attaches the Firebase UID to every server request.
2. **Research Creation** – Client calls `/api/research` to create a Firestore document (defaults to `awaiting_refinements`, immediately transitions to `refining` when the provider returns questions) and start the OpenAI Deep Research session.
3. **Refinement Loop** – UI surfaces one question at a time. Answers are posted to `/api/research/:id/openai/answer`, which now persists `{index, answer}` pairs, appends provider follow-ups, and transitions the research to `ready_to_run` once `finalPrompt` arrives. The client uses `hydrateRefinementState` (server action) plus the `RefinementQA` component to retain local drafts across navigation while the state machine advances.
4. **Parallel Execution** – `/api/research/:id/run` triggers OpenAI Deep Research execution and Gemini generation concurrently. Polling keeps Firestore updated.
5. **Finalization** – `/api/research/:id/finalize` assembles a PDF report, attempts Gmail delivery (SendGrid fallback), updates `report.emailStatus`, and marks the research as completed.

## Directory Responsibilities

- `app/` – Next.js routes. UI pages and REST-like API endpoints.
- `src/components/` – Reusable presentational components (cards, progress indicators, refinement UI).
- `src/config/` – Environment parsing and validation.
- `src/lib/` – Provider wrappers, response normalizers, Firebase helpers, utilities for PDF/email/logging.
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
- The React tree is wrapped with `AuthProvider` from `src/lib/firebase/auth-context.tsx` so client components can call `useAuth()` for loading state, the current Firebase user, and the latest ID token.
- `AuthProvider` mirrors refreshed ID tokens into a `firebaseToken` cookie (1-hour max-age, `SameSite=Strict`) so middleware can authenticate soft navigations without extra API calls.
- `/sign-in` uses `signInWithPopup` with the Firebase Google provider, enforcing `browserLocalPersistence` and redirecting to the `redirectedFrom` query param or `/dashboard` after success.
- Local development can opt into a synthetic session by setting `DEV_AUTH_BYPASS=true` (and optional UID/email overrides). When active in non-production environments, the middleware injects those headers without hitting Firebase so `pnpm dev` can render authenticated pages.

## Data Access Layer

- `FirestoreResearchRepository` owns conversions between Firestore documents and `Research` domain models, enforces the state machine (`awaiting_refinements → refining → ready_to_run → running → completed|failed`), and guarantees pagination stability using a base64 cursor that captures the `createdAt` timestamp + document id.
- Repositories merge nested provider/report sub-objects safely and always stamp `createdAt`/`updatedAt` timestamps server-side.
- `FirestoreUserRepository` persists Gmail OAuth token payloads alongside user profile metadata, allowing secure token refresh flows.
- Repository instances are singletons by default, but tests can override them with in-memory doubles via `setResearchRepository`/`setUserRepository`.

## Client Data Fetching & Optimistic UI

- Dashboard and creation flows use SWR with the Firebase ID token in the cache key so per-user data remains isolated.
- `useResearchList` provides the paginated list (default page size 20) and exposes `mutate` for optimistic updates.
- Creating a research session calls `createResearch` helper, then prepends the returned item to the SWR cache before revalidating in the background.
- Research detail views rely on `useResearchDetail`, fetching `/api/research/:id` to surface the latest refinement questions immediately after creation.
- Errors from `/api/research` surface through a shared `ApiError` class so UI components can render consistent messaging.

## Deployment Considerations

- **Vercel Edge** for UI routes without heavy dependencies.
- **Node runtime** (Vercel Serverless Function) for provider calls, PDF generation, and email sending.
- **Secrets** via Vercel environment variables. Gmail OAuth tokens should be encrypted (see `TOKEN_ENCRYPTION_KEY`).
- Environment helpers (`getServerEnv` / `getPublicEnv`) ensure server secrets stay off the client bundle while still validating configuration with Zod.
- **Firestore Indexes** – `research` collection indexes `(ownerUid ASC, createdAt DESC)` via `firestore.indexes.json` (deployed 2025-10-15).
- **Firestore Rules** – `firestore.rules` locks access to authenticated users’ own `users/{uid}` and `research/{id}` documents; deployed with the CLI alongside indexes on 2025-10-15.
- **Analytics** – `getClientAnalytics()` lazily loads Firebase Analytics once the browser environment is ready and a measurement ID is supplied.

## Observability

- Structured JSON logging (`src/lib/utils/logger.ts`) to pipe context (request id, research id, provider).
- Provider integrations emit `provider.request.*` and `gemini.generate.*` logs around retries/poll attempts so transient
  failures are traceable; exponential backoff (max 3 attempts per HTTP request) is built into both OpenAI Deep Research and
  Gemini wrappers.
- Surface metrics (counts by status, duration averages) using a future instrumentation layer or third-party service.

## TODO Highlights

- Verify Firebase Auth session validation end-to-end against the deployed Firestore rules.
- Integrate OpenAI Deep Research & Gemini using provider utilities.
- Flesh out PDF layouts with multi-page support in `src/lib/pdf/builder.ts`.
- Build resilient email delivery with Gmail + SendGrid fallback.
- Add full coverage tests referencing requirement matrix in the project brief.
