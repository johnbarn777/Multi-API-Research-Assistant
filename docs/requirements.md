# Multi-API Deep Research Assistant – Functional Requirements & Test Plan

**Stack (Locked per your choices):**

* **Frontend:** Next.js 15 (App Router) + React + TypeScript + Tailwind CSS (basic but modern styling)
* **Backend:** Next.js API routes (TypeScript). (Optionally Express server adapter if needed for local dev.)
* **Auth & DB:** Firebase (Firebase Auth with Google provider; Firestore for persistence; optional Cloud Storage for PDF backups)
* **Integrations:**

  * **OpenAI Deep Research API** (refinement loop)
  * **Google Gemini API** (no refinement; fire with refined prompt)
  * **PDF generation:** `pdf-lib` or `pdfkit` (Node) with server-side rendering
  * **Email:** **Gmail API (preferred)** using OAuth (user-consented `gmail.send` scope). **Fallback**: SendGrid/Mailgun transactional email.
* **Hosting/DevOps:** Vercel (Edge where feasible; Node runtime for PDF & email). CI: GitHub Actions.
* **Analytics:** Firebase Analytics (web) – lazy-loaded in the client when a measurement ID is configured.
* **Testing:** Unit + Integration + E2E (required for all requirements): Jest/Vitest, Supertest, Playwright.

---

## 1) Product Overview & Scope

Build a full‑stack web app that lets a signed‑in user submit a research topic, iteratively refines it via **OpenAI Deep Research** (question/answer loop), then uses the final refined prompt to run **Gemini** research. When both results are complete, generate a PDF report (two sections: OpenAI vs Gemini) and **email it** to the user.

### In-Scope

* Google sign‑in; session handling
* Research creation; interactive refinement loop (OpenAI); Gemini execution
* Progress states and history list
* PDF generation; email delivery

### Explicit Non‑Goals (MVP)

* Multi‑user collaboration on a single research
* Role-based admin console
* Fine-grained billing/quotas
* Rich WYSIWYG editing of results (read-only display is fine)

---

## 2) User Roles & Stories

**Role:** Authenticated end user (Google sign-in)

**Key Stories**

1. As a user, I can sign in with Google to access my research dashboard.
2. As a user, I can create a **New Research** by entering a topic.
3. As the system, I start an OpenAI DR session; if refinement questions arise, I am prompted one-at-a-time until finalized.
4. As the system, once the refined prompt is confirmed, I run **OpenAI DR** and **Gemini** in parallel with the same refined prompt.
5. As a user, I can see progress (e.g., awaiting refinements, running, completed).
6. As the system, when both complete, I generate a PDF report and email it to the user; I store the results and email status in history.
7. As a user, I can view my past research sessions with timestamps and status; I can reopen a session to see details.

---

## 3) System Architecture

* **Next.js App Router** for pages and server actions.
* **API routes** under `/api/*` handle:

  * `/api/auth/session` – token exchange, Gmail OAuth scope validation
  * `/api/research` – CRUD (create, get, list)
  * `/api/research/:id/openai` – start/refine/submit; polling webhook (if provided)
  * `/api/research/:id/gemini` – start; poll status
  * `/api/research/:id/finalize` – assemble report; PDF; email
* **Firestore** for persistence (see Data Model).
* **Queues/Jobs:** Minimal. Use Firestore state machine + periodic polling via API routes/Server Actions. (Optionally use Vercel Cron for re‑try/poll tasks.)
* **Secrets:** Environment variables injected via Vercel.

Sequence (happy path):

1. User creates Research → record written as `status: "awaiting_refinements"`.
2. Backend opens OpenAI DR session → stores `dr_session_id`.
3. System exchanges refinement Q/A with user → stores `refinements[]` and **final_refined_prompt**.
4. System triggers both providers with **final_refined_prompt** → parallel tasks.
5. Poll until both complete → store raw results + normalized summary.
6. Generate PDF → email via Gmail API (fallback to SendGrid) → update `email_status`.

---

## 4) Data Model (Firestore)

**Collections**

### `users/{uid}`

* `uid: string` (Firebase Auth UID)
* `email: string`
* `displayName: string`
* `photoURL?: string`
* `gmail_oauth`: `{ access_token?: string, refresh_token?: string, expiry_date?: number, scope?: string }` *(only if Gmail API path used; stored securely – consider encrypting)*
* `createdAt: Timestamp`
* `updatedAt: Timestamp`

### `research/{id}`

* `id: string`
* `ownerUid: string`
* `title: string` (user input topic)
* `status: "awaiting_refinements" | "refining" | "ready_to_run" | "running" | "completed" | "failed"`
* `dr`: {

  * `sessionId?: string`,
  * `jobId?: string`,
  * `questions: Array<{ index: number, text: string }>`,
  * `answers: Array<{ index: number, answer: string }>`,
  * `finalPrompt?: string`,
  * `status?: "idle" | "queued" | "running" | "success" | "failure"`,
  * `result?: ProviderResult`,
  * `durationMs?: number`,
  * `startedAt?: string`,
  * `completedAt?: string`,
  * `error?: string | null`
    }
* `gemini`: {

  * `jobId?: string`,
  * `status?: "idle" | "queued" | "running" | "success" | "failure"`,
  * `result?: ProviderResult`,
  * `durationMs?: number`,
  * `startedAt?: string`,
  * `completedAt?: string`,
  * `error?: string | null`
    }
* `report`: {

  * `pdfPath?: string` (Cloud Storage path or ephemeral)
  * `emailedTo?: string`
  * `emailStatus?: "queued" | "sent" | "failed"`
  * `emailError?: string | null`
    }
* `createdAt: Timestamp`
* `updatedAt: Timestamp`

**Type `ProviderResult`**

```ts
interface ProviderResult {
  raw: any;                 // full JSON returned by provider
  summary: string;          // system-generated digest
  insights: string[];       // key bullets
  sources?: Array<{ title: string; url: string }>; // if provided
  meta?: { tokens?: number; model?: string; startedAt?: string; completedAt?: string };
}
```

**Indexes**

* `research` composite index: `ownerUid ASC, createdAt DESC, __name__ DESC`

---

## 5) Authentication & Authorization

* **Sign-in:** Firebase Auth **Google provider**.
* **Session:** Next.js middleware validates Firebase ID token and injects `uid` to server context.
* **Gmail API Consent:** On first email send, prompt a **separate Google OAuth consent** with `gmail.send` scope (via Google Identity Services). Store tokens under `users/{uid}.gmail_oauth` (encrypted at rest). If consent absent/expired, use **SendGrid** fallback.
* **Authorization:** Every API route enforces `research.ownerUid === uid` for read/write.

**Security Notes**

* Do not store provider API keys in client.
* Encrypt `gmail_oauth` using a server-side key (e.g., Google Tink or Node crypto with KMS-managed key).
* Rate limit create/update endpoints per user (basic in-memory or Redis on Vercel KV if enabled).

---

## 6) Research Flow (Detailed)

### 6.1 Create Research

**Input:** `title: string`
**Process:**

1. Create `research` doc with `status: "awaiting_refinements"`.
2. Call `OpenAI DR: POST /sessions` → store `dr.sessionId`.
3. Read initial questions → set `status: "refining"`, persist `dr.questions`.
   **Output:** Research page with stepper showing next question.

### 6.2 Refinement Loop (OpenAI)

**UX:** Display one question at a time with free‑text answer; allow back/next; show progress `Q i of N`.
**Backend:**

* `POST /api/research/:id/openai/answer` → send `{ sessionId, answer }` to OpenAI DR → receives next question or final prompt.
* If final prompt produced: set `dr.finalPrompt`, set `status: "ready_to_run"`.

### 6.3 Execution (Parallel)

Upon `"Run"` or auto‑continue:

* Transition to `status: "running"`.
* Kick **two tasks**:

  * `OpenAI DR: POST /sessions/:id/execute` (or consolidated run endpoint). Poll until complete → store `dr.result` + `durationMs`.
  * `Gemini: POST /v1/models/...:generateContent` with `dr.finalPrompt`. Poll if async; else store result immediately.
* When **both complete**, trigger Finalization.

### 6.4 Finalization (PDF + Email)

* Build a **two‑section PDF**:

  * Cover: Title, user, timestamps
  * Section A: **OpenAI Deep Research Results** (summary, insights, sources, raw appendix link)
  * Section B: **Gemini Results** (same structure)
  * Footer: Duration, metadata
* Email:

  * If Gmail tokens present and valid → `gmail.users.messages.send` with base64 RFC822 + PDF attachment
  * Else fallback → SendGrid API `mail/send`
* Update `report.emailStatus`/`report.emailError` and store PDF location if persisted.
* Set `status: "completed"`.

---

## 7) API Contracts

### 7.1 `POST /api/research`

**Body:** `{ title: string }`
**Resp:** `{ id: string, status: string }`

### 7.2 `GET /api/research`

Query: `?cursor=<ts|docId>`
**Resp:** `{ items: ResearchCard[], nextCursor?: string }`

### 7.3 `GET /api/research/:id`

**Resp:** Full `research` document.

### 7.4 `POST /api/research/:id/openai/answer`

**Body:** `{ answer: string }`
**Resp:** `{ nextQuestion?: string, finalPrompt?: string }`

### 7.5 `POST /api/research/:id/run`

**Resp:** `{ item: Research, alreadyRunning?: boolean }` → transitions research to `running` and triggers OpenAI + Gemini execution in background (`Promise.allSettled`). Firestore updates each provider’s `status`, `startedAt`, `completedAt`, `durationMs`, `result`, and `error` as runs settle (supports partial success).

### 7.6 `POST /api/research/:id/finalize`

(Internal) Generates the comparative PDF report once provider runs settle. Responds with `application/pdf` body (`Content-Disposition: attachment`) and headers:

* `X-Report-Pdf-Path` – Cloud Storage object path when `FIREBASE_STORAGE_BUCKET` is configured, otherwise a `buffer://` placeholder for ephemeral downloads.
* `X-Storage-Status` – `"uploaded"` when persisted to storage, `"skipped"` when only in-memory buffer is available.

Side effects:

* Updates `research.report.pdfPath` with the returned path.
* Leaves report email status untouched (email delivery handled in Commit 9).

---

## 8) UI/UX Requirements

* **Pages:**

  * `/` → Welcome/Sign-in if not authenticated; else dashboard
  * `/research/new` → simple form with topic input
  * `/research/:id` → stepper for refinements → progress cards for both providers → final report ready banner
* **Components:**

  * `ResearchCard` (title, createdAt, status chip)
  * `RefinementQA` (question, textarea, back/next)
  * `ProviderProgress` (OpenAI/Gemini status: idle/queued/running/success/failure; summaries, tokens, timestamps)
  * `Toasts` for errors
* **Responsive:** Mobile-first; single-column; min tap targets 44px; dashboard verified at 375px width with no horizontal scroll.
* **Empty States:** Helpful copy; guide to create first research.
* **Accessibility:** Labels for inputs, semantic headings, focus ring, skip link to main content, and axe-core audits on dashboard/detail flows.

**Status Chips**

* awaiting_refinements | refining | ready_to_run | running | completed | failed

---

## 9) Error Handling & Retries

* Standardized error envelope `{ code, message, retryAfterMs?, requestId }` from API routes via `jsonError`.
* **Retries:**

  * Provider calls: exponential backoff (up to 3 attempts) shared through `retryWithBackoff`.
  * Email send: retry once, then fallback provider; surface `emailStatus` in UI.
* **Timeouts:** Provider calls capped (e.g., 60s); long tasks use polling.
* **Partial Failure:** If one provider fails, PDF still generated with successful provider and failure note; email still sent.

---

## 10) Security, Privacy, Compliance

* OAuth consent screens configured with accurate scopes & privacy policy.
* Encrypt stored Gmail tokens; never log access tokens or PII.
* CORS restricted to app domain; CSRF protection via same-site cookies for web.
* Input validation on all API bodies with Zod.

---

## 11) Observability

* Structured logs with request id, research id, provider, duration.
  * API responses echo `X-Request-Id` so clients can correlate with server logs.
* Basic metrics: counts by status, average duration per provider.
* Error traces with provider context (no secrets).

---

## 12) Environment Variables (Vercel)

```
# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET= # optional; when set, PDFs uploaded to this bucket
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# OpenAI Deep Research
OPENAI_API_KEY=
OPENAI_DR_BASE_URL=https://api.openai.com/v1

# Google Gemini
GEMINI_API_KEY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1
GEMINI_MODEL=gemini-2.0-pro

# Gmail API (OAuth client for gmail.send)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
GOOGLE_OAUTH_SCOPES="https://www.googleapis.com/auth/gmail.send"
TOKEN_ENCRYPTION_KEY= # 32-byte base64 key; generate with `openssl rand -base64 32`

# Fallback Email
SENDGRID_API_KEY= # optional fallback provider key
FROM_EMAIL=no-reply@yourapp.com

# App
APP_BASE_URL=https://your-vercel-domain.vercel.app
```

Environment parsing now distinguishes server-only secrets from `NEXT_PUBLIC_*` client variables in `src/config/env.ts`, rejecting misconfiguration (including invalid base64 token keys) at startup and normalizing Firebase private keys.
Gmail OAuth tokens must be stored encrypted using the AES-256-GCM helper in `src/lib/security/crypto.ts`, keyed by `TOKEN_ENCRYPTION_KEY`.

---

## 13) Test Plan (Unit + Integration + E2E)

**Testing Tools**

* **Unit:** Vitest/Jest
* **Integration (API):** Supertest (Next API handler wrapped)
* **E2E (UI):** Playwright
* **Mocking:** MSW (HTTP), `firebase-mock`/emulators, nock for provider APIs

### 13.1 Functional Requirement → Test Matrix

#### FR-1 Authentication (Google Sign‑in via Firebase)

**Acceptance Criteria**

* AC1: Unauthenticated user sees Sign‑in; post sign‑in lands on Dashboard.
* AC2: Session persists across refresh; sign‑out clears session.
* AC3: Server routes reject unauthenticated requests with 401.
* AC4: Protected routes redirect unauthenticated visitors to `/sign-in` and preserve the original destination.
* AC5: Global header surfaces current user identity (name/email/avatar when available) and provides an explicit sign-out control.

**Unit Tests**

* UT1: Auth context provides `uid` when token present.
* UT2: Middleware blocks request when no/invalid token. (`tests/unit/middleware.test.ts`)

**Integration Tests**

* IT1: `GET /api/research` returns 401 when not signed in. (`tests/integration/api-research.test.ts`)
* IT2: `GET /api/research` returns items for the signed‑in `uid`. (`tests/integration/api-research.test.ts`)

**E2E Tests**

* EE0: Visiting a protected route while unauthenticated redirects to Sign-in. (`tests/e2e/research.spec.ts`; executing `pnpm test:e2e` currently fails because the Next.js dev server cannot bundle `firebase-admin`'s `node:` imports. Investigate alternative bundler config in a follow-up.)
* EE1: Sign‑in flow using Firebase emulator → lands on dashboard.
* EE2: Sign‑out hides dashboard routes.

**Pass/Fail**

* **Pass:** All ACs met; protected endpoints inaccessible without auth.
* **Fail:** Any endpoint returns data for wrong uid or allows unauthenticated access.

---

#### FR-2 Create Research & Start OpenAI DR Session

**Acceptance Criteria**

* AC1: `POST /api/research` creates the document and defaults to `status: "awaiting_refinements"` with sanitized title.
* AC2: When the provider returns initial questions, the handler stores `dr.sessionId`, snapshots the array, and transitions status to `"refining"`.
* AC3: UI form submits a topic, optimistic updates the dashboard list, and redirects to the detail page to continue refinements.

**Unit**

* UT1: Zod schema rejects empty title.
* UT2: Mapper transforms DR initial payload into `questions[]`.

**Integration**

* IT1: `POST /api/research` → Firestore write + DR call mock → stored doc matches shape (`sessionId`, `questions`, status).
* IT2: Error path: DR unavailable → API returns `502` with `{ error }`; no document created so user can retry.
* IT3: `GET /api/research/:id` → returns owner-scoped document with initial questions surfaced for the UI.

**E2E**

* EE1: User types title → sees first refinement question.

**Pass/Fail**

* **Pass:** Document persists with session metadata, dashboard reflects new entry immediately, `/research/[id]` renders the first question, and user is routed to continue refinements.
* **Fail:** Session id missing, questions not stored when provided, question view not hydrated, or API fails to surface actionable error on provider failure.

---

#### FR-3 Refinement Loop

**Acceptance Criteria**

* AC1: Answering a question posts to `/openai/answer` and returns either next question or final prompt.
* AC2: When final prompt produced, `dr.finalPrompt` saved; status becomes `ready_to_run`.
* AC3: User can navigate back to previous answers before finalization.

**Unit**

* UT1: Answer payload validator.
* UT2: Reducer merges `{index, answer}` correctly.

**Integration**

* IT1: Post answer → mock returns next question → Firestore updates `answers[]` & `questions[]` cursor.
* IT2: Post answer → mock returns final prompt → `finalPrompt` set, status updated.

**E2E**

* EE1: Complete multi‑question loop visually; final prompt visible for confirmation.

**Pass/Fail**

* **Pass:** Final prompt persisted and visible; back/next works.
* **Fail:** Lost answers on navigation; status not updated.

_Status (2025-10-16): `/api/research/:id/openai/answer` now persists answers, appends follow-up questions, and transitions research to `ready_to_run` once the final prompt lands. Client `RefinementQA` retains local drafts across navigation. Verified via `pnpm test:unit`, `pnpm test:integration`, and `pnpm test:e2e --project=chromium`._

---

#### FR-4 Execute Providers in Parallel (OpenAI & Gemini)

**Acceptance Criteria**

* AC1: Clicking **Run** triggers both tasks.
* AC2: Progress indicators show each provider’s state.
* AC3: On completion, both results stored as `ProviderResult`.
* AC4: If one fails, other still stored; status may proceed to finalize with partial data.

**Unit**

* UT1: Normalizer converts raw provider payloads into `ProviderResult` shape.
* UT2: Poller stops when done or on error with retries applied.

**Integration**

* IT1: Run → two mocked jobs complete → results persisted; durations recorded.
* IT2: One job fails → error recorded; proceed to finalization with partial.

**E2E**

* EE1: User runs; sees both providers progress to success.

**Pass/Fail**

* **Pass:** Parallel execution + correct persistence.
* **Fail:** Only one provider runs or missing results.

---

#### FR-5 PDF Report Generation

**Acceptance Criteria**

* AC1: PDF contains cover + two sections with summaries, insights, sources.
* AC2: Metadata (timestamps, duration) included.
* AC3: PDF is generated server‑side and is downloadable.

**Unit**

* UT1: PDF builder renders section titles and lists given mock data. (Covered via `tests/unit/pdf/builder.test.ts`.)

**Integration**

* IT1: `/finalize` builds PDF buffer for stored results. (Covered via `tests/integration/research-finalize.test.ts`.)

**E2E**

* EE1: After completion, “Download PDF” link works and opens a valid PDF (Playwright verifies bytes start with `%PDF`). (Covered via `tests/e2e/research.spec.ts`.)

**Pass/Fail**

* **Pass:** PDF structurally valid and content present.
* **Fail:** Missing sections or invalid file.

---

#### FR-6 Email Delivery (Gmail preferred, fallback transactional)

**Acceptance Criteria**

* AC1: If `gmail_oauth` exists & valid → send via Gmail API `gmail.send`.
* AC2: If OAuth absent/invalid → send via SendGrid using `FROM_EMAIL`.
* AC3: Store `report.emailStatus` (sent/failed) and target email.
* AC4: Persist `report.emailError` with the provider failure message when delivery fails.

**Unit**

* UT1: RFC822 generator attaches PDF base64. (`tests/unit/email/gmail.test.ts`)
* UT2: Fallback selector chooses provider correctly. (`tests/unit/email/sendResearchReport.test.ts`)

**Integration**

* IT1: Gmail success mock → status `sent`. (`tests/integration/research-finalize.test.ts`)
* IT2: Gmail failure → fallback SendGrid success → status `sent`. (`tests/integration/research-finalize.test.ts`)
* IT3: Both fail → status `failed` with error message stored. (`tests/integration/research-finalize.test.ts`)

**E2E**

* EE1: Completing a run results in a “Email sent” banner; webhook/mailbox test optional (mock inbox). (`tests/e2e/research.spec.ts`)
* EE2: Delivery failure surfaces an “Email failed” banner with the captured reason. (`tests/e2e/research.spec.ts`)

**Pass/Fail**

* **Pass:** At least one provider path functions; status tracked.
* **Fail:** No email attempt or wrong provider chosen.

---

#### FR-7 Dashboard & History

**Acceptance Criteria**

* AC1: Server-rendered dashboard lists prior research sessions (most recent first) with status chips, empty state, and responsive layout.
* AC2: Clicking an item opens detail view.
* AC3: Loading skeletons display during initial navigation while data is fetched.

**Unit**

* UT1: `tests/unit/components/ResearchCard.test.tsx` verifies status chip labelling and created-date fallbacks.
* UT2: `tests/unit/components/ResearchCardList.test.tsx` covers empty state CTA rendering.

**Integration**

* IT1: `tests/integration/api-research.test.ts` validates `GET /api/research` limit/cursor pagination behaviour.

**E2E**

* EE1: `tests/e2e/research.spec.ts` confirms dashboard ordering/status display with fixture-backed sessions.

**Pass/Fail**

* **Pass:** Accurate list + navigation.
* **Fail:** Items from other users or wrong order.

#### INF-1 Environment Configuration & Secrets

**Acceptance Criteria**

* AC1: `src/config/env.ts` validates required server vs client variables separately and fails fast on missing/invalid values.
* AC2: `TOKEN_ENCRYPTION_KEY` must be a 32-byte base64 string used to decrypt Gmail OAuth payloads.
* AC3: Gmail OAuth tokens can be round-tripped via AES-256-GCM helpers in `src/lib/security/crypto.ts`.
* AC4: Setting `DEMO_MODE=true` disables live provider/email/storage integrations in favour of deterministic fixtures for demos; defaults to `false`.
* Note: `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is optional and only required when Firebase Analytics is enabled.

**Unit**

* UT1: `tests/unit/env.test.ts` covers happy-path parsing and missing variable failures.
* UT2: `tests/unit/crypto.test.ts` exercises encrypt/decrypt round-trip with sample key.
* UT3: `tests/unit/env.test.ts` asserts boolean parsing for `DEMO_MODE`.

**Integration**

* Not applicable (no external services invoked).

**E2E**

* Not applicable.

**Test Execution Notes**

* Initial `pnpm test:unit` run failed because Vitest lacked an alias for `@/`; fixed by updating `vitest.config.ts`/`vitest.integration.config.ts`, after which the suite passes.
* Commit 3 introduces a typed Firestore data layer; repository unit tests (Vitest) validate state transitions & pagination, and integration coverage exercises `/api/research` create/list flows with middleware in place.
* 2025-10-15: `pnpm lint` now passes after normalizing type-only imports, removing `any` usage in provider clients, and tightening placeholder email stubs.
* 2025-10-15: Google sign-in is wired via Firebase Auth (`signInWithPopup` + `browserLocalPersistence`) and the client syncs the `firebaseToken` cookie for middleware consumption.
* 2025-10-16: Commit 10 dashboard polish verified with `pnpm test:unit` and `pnpm test:integration`. Playwright dashboard scenario uses a non-production `__dashboard_fixture` cookie to feed fixture data into the server-rendered list.
* 2025-10-17: Commit 11 reliability work verified via `pnpm test:unit` (new `tests/unit/utils/retry.test.ts`) and `pnpm test:integration` (`tests/integration/provider-retry.test.ts`, updated finalize email scenarios).
* 2025-10-17: Commit 12 accessibility & CI updates validated with `pnpm test:e2e` (axe-core scan + mobile viewport) and the new GitHub Actions workflow.

---

### 13.2 Non‑Functional Requirements → Tests

**NFR-1 Mobile Responsiveness**

* **AC:** Layout adapts to ≤375px width without overflow; tap targets ≥44px.
* **E2E:** Viewport iPhone 13 snapshot tests; no horizontal scroll.

**NFR-2 Performance**

* **AC:** Time to interactive < 3s on mid‑range mobile for dashboard; provider operations are async.
* **Test:** Lighthouse budget; ensure API calls are deferred.

**NFR-3 Accessibility**

* **AC:** Labels on all inputs; contrast ratio ≥4.5; keyboard navigation.
* **Test:** Playwright + axe-core checks.

**NFR-4 Security**

* **AC:** Authz checks on every API route; encryption for Gmail tokens.
* **Test:** Integration attempts to access other user’s doc → 403.
* **Status (2025-10-15):** Firestore rules deployed via CLI lock `users/{uid}` and `research/{id}` documents to the owning UID; verify API layer alignment during integration tests.

**NFR-5 Reliability**

* **AC:** Provider calls retried up to 3 times with backoff.
* **Test:** Simulate transient 5xx → eventual success (`tests/integration/provider-retry.test.ts`).

---

## 14) Implementation Notes (MVP)

* **OpenAI DR** endpoints vary; implement via `OPENAI_API_KEY` and a session abstraction (`src/lib/providers/openaiDeepResearch.ts`) covering `startSession()`, `submitAnswer()`, `executeRun()`, `pollResult()` with retry/backoff.
* **Gemini**: `generateContent` (`src/lib/providers/gemini.ts`) accepts the refined prompt, retries transient failures, and polls pending operations when necessary.
* **Provider normalization**: Map provider responses into `ProviderResult` via `src/lib/providers/normalizers.ts` so downstream consumers have a consistent shape.
* **PDF**: Use `pdf-lib` for text + lists; avoid heavy fonts; render in Node runtime.
* **Email**: Build RFC822, attach PDF (base64); send to `user.email`.
* **Demo mode**: Flip `DEMO_MODE=true` to drive the entire flow with fixture data—refinement questions, provider summaries, email delivery (console preview), and PDF storage bypass—while still exercising the UI and persistence paths. Finalize responses expose `X-Email-Preview-Base64` so demos can surface the mocked email copy.
* **State Machine**: enforce allowed transitions (`awaiting_refinements → refining → ready_to_run → running → completed|failed`).
* **Dev Auth Bypass**: Local developers blocked on Firebase sign-in can export `DEV_AUTH_BYPASS=true` (with optional UID/email overrides) to have the middleware inject a stub user during `pnpm dev`; keep unset in production.

---

## 15) Definition of Done (Global)

* All **FR-1…FR-7** ACs passing.
* All **NFRs** passing baseline checks.
* Unit + Integration + E2E suites in CI; green on PR.
* `.env.example` populated; README includes setup for Firebase emulators + provider mocks.
* Deployed on Vercel; public URL accessible; demo account available.

---

## 16) Future Enhancements (Post‑MVP)

* Webhooks for provider completion instead of polling
* Rich report styling & HTML-to-PDF
* Cost tracking & quotas per user
* Team sharing & comments on research sessions
* Source de-duplication and cross‑provider insight reconciliation
