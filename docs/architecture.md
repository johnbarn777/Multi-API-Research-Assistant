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
- `src/server/` – Orchestration logic and state machine enforcing valid status transitions.
- `src/tests/` – Shared mocks (MSW, Firebase emulators) reuseable across test suites.
- `tests/` – Unit, integration, and E2E test entry points.

## Deployment Considerations

- **Vercel Edge** for UI routes without heavy dependencies.
- **Node runtime** (Vercel Serverless Function) for provider calls, PDF generation, and email sending.
- **Secrets** via Vercel environment variables. Gmail OAuth tokens should be encrypted (see `TOKEN_ENCRYPTION_KEY`).
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
