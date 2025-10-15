# Architecture Overview

## High-Level Flow

1. **Authentication** – User signs in with Google via Firebase Auth. Middleware attaches the Firebase UID to every server request.
2. **Research Creation** – Client calls `/api/research` to create a Firestore document (status `awaiting_refinements`) and start the OpenAI Deep Research session.
3. **Refinement Loop** – UI surfaces one question at a time. Answers are posted to `/api/research/:id/openai/answer` until the provider returns a final prompt.
4. **Parallel Execution** – `/api/research/:id/run` triggers OpenAI Deep Research execution and Gemini generation concurrently. Polling keeps Firestore updated.
5. **Finalization** – `/api/research/:id/finalize` assembles a PDF report, attempts Gmail delivery (SendGrid fallback), updates `report.emailStatus`, and marks the research as completed.

## Directory Responsibilities

- `app/` – Next.js routes. UI pages and REST-like API endpoints.
- `src/components/` – Reusable presentational components (cards, progress indicators, refinement UI).
- `src/config/` – Environment parsing and validation.
- `src/lib/` – Provider wrappers, Firebase helpers, utilities for PDF/email/logging.
- `src/lib/security/` – Encryption helpers for Gmail OAuth tokens and future secret utilities.
- `src/server/` – Orchestration logic and state machine enforcing valid status transitions.
- `src/server/repositories/` – Firestore data access layer containing strongly-typed repositories for research and user documents.
- `src/tests/` – Shared mocks (MSW, Firebase emulators) reuseable across test suites.
- `tests/` – Unit, integration, and E2E test entry points.

## Authentication & Session Handling

- `middleware.ts` executes on every request (except public paths) and verifies Firebase ID tokens supplied via `Authorization: Bearer`, `x-firebase-id-token`, or supported session cookies. The middleware performs verification via Firebase's Identity Toolkit REST API so it can run inside the Edge runtime (avoiding the `firebase-admin` Node dependency). When verification succeeds it injects `x-user-uid`, `x-user-email`, and `x-firebase-id-token` headers before forwarding the request.
- API routes leverage `src/server/auth/session.ts` helpers (`ensureAuthenticated`, `requireAuth`) to read the injected headers and short-circuit unauthorized calls with a `401` JSON response.
- Page requests without valid credentials are redirected to `/sign-in?redirectedFrom=<path>`.
- The React tree is wrapped with `AuthProvider` from `src/lib/firebase/auth-context.tsx` so client components can call `useAuth()` for loading state, the current Firebase user, and the latest ID token.

## Data Access Layer

- `FirestoreResearchRepository` owns conversions between Firestore documents and `Research` domain models, enforces the state machine (`awaiting_refinements → refining → ready_to_run → running → completed|failed`), and guarantees pagination stability using a base64 cursor that captures the `createdAt` timestamp + document id.
- Repositories merge nested provider/report sub-objects safely and always stamp `createdAt`/`updatedAt` timestamps server-side.
- `FirestoreUserRepository` persists Gmail OAuth token payloads alongside user profile metadata, allowing secure token refresh flows.
- Repository instances are singletons by default, but tests can override them with in-memory doubles via `setResearchRepository`/`setUserRepository`.

## Deployment Considerations

- **Vercel Edge** for UI routes without heavy dependencies.
- **Node runtime** (Vercel Serverless Function) for provider calls, PDF generation, and email sending.
- **Secrets** via Vercel environment variables. Gmail OAuth tokens should be encrypted (see `TOKEN_ENCRYPTION_KEY`).
- Environment helpers (`getServerEnv` / `getPublicEnv`) ensure server secrets stay off the client bundle while still validating configuration with Zod.
- **Firestore Indexes** – `research` collection should index `(ownerUid ASC, createdAt DESC)`.

## Observability

- Structured JSON logging (`src/lib/utils/logger.ts`) to pipe context (request id, research id, provider).
- Surface metrics (counts by status, duration averages) using a future instrumentation layer or third-party service.

## TODO Highlights

- Implement Firebase Auth session validation and Firestore access control.
- Integrate OpenAI Deep Research & Gemini using provider utilities.
- Flesh out PDF layouts with multi-page support in `src/lib/pdf/builder.ts`.
- Build resilient email delivery with Gmail + SendGrid fallback.
- Add full coverage tests referencing requirement matrix in the project brief.
