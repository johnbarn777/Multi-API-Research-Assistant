# Multi-API Deep Research Assistant


This repository scaffolds a Next.js 15 full-stack application that orchestrates OpenAI Deep Research, Google Gemini, PDF report generation, and email delivery. Functionality is intentionally stubbed – the goal is to provide a clear, scalable structure that you can iterate on quickly.

## Stack Overview

- **Framework:** Next.js 15 App Router + React + TypeScript
- **Styling:** Tailwind CSS with utility-first design
- **Auth & Data:** Firebase Auth (Google provider) + Firestore
- **Integrations:** OpenAI Deep Research, Google Gemini, pdf-lib, Gmail API (OAuth), SendGrid fallback
- **Testing:** Vitest (unit & integration), Supertest, Playwright (E2E), MSW for mocks
- **Hosting:** Designed for Vercel deployment (Edge for UI, Node runtime for heavy tasks)

## Repository Layout

```
.
├── app/                     # Next.js App Router routes (UI + API placeholders)
├── src/
│   ├── components/          # Reusable UI and research components
│   ├── config/              # Typed environment variable parsing
│   ├── lib/                 # Firebase wrappers, providers, email, PDF helpers
│   ├── server/              # Backend orchestration + state machine utilities
│   ├── tests/               # Shared test utilities and mocks
│   └── types/               # Shared TypeScript contracts
├── tests/                   # Unit, integration, and E2E suites
├── playwright.config.ts     # Playwright configuration for E2E tests
├── vitest.config.ts         # Vitest unit test configuration
├── vitest.integration.config.ts
└── .env.example             # Required environment variables
```

### Key App Router Paths

- `/` – Marketing landing page placeholder
- `/sign-in` – Google sign-in stub (Firebase integration pending)
- `/dashboard` – Authenticated dashboard layout with mock research cards
- `/research/new` – Form stub for creating a research session
- `/research/[id]` – Refinement loop vision + provider progress panels
- `/api/auth/session` – Firebase session validation placeholder
- `/api/research` + nested routes – CRUD + workflow endpoints ready for implementation

## Getting Started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

   Playwright browser binaries are skipped automatically in CI/hosted installs. Run the following once locally if you plan to execute E2E tests:

   ```bash
   pnpm playwright:install
   ```

2. **Set environment**

   ```bash
   cp .env.example .env.local
   # populate values before running the app
   ```

3. **Run the dev server**

   ```bash
   pnpm dev
   ```

4. **Lint, type-check, and run tests**

   ```bash
   pnpm lint
   pnpm type-check
   pnpm test:unit
   pnpm test:integration
   pnpm test:e2e
   pnpm test
   # or run every check sequentially
   pnpm test:ci
   ```

## Authentication Setup

## Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | server | Firebase project ID (matches emulator project when running locally). |
| `FIREBASE_CLIENT_EMAIL` | server | Service account email used by Firebase Admin SDK. |
| `FIREBASE_PRIVATE_KEY` | server | Service account private key; multiline values with `\n` are normalized automatically. |
| `OPENAI_API_KEY` / `OPENAI_DR_BASE_URL` | server | Credentials and base URL for OpenAI Deep Research. |
| `GEMINI_API_KEY` / `GEMINI_BASE_URL` / `GEMINI_MODEL` | server | Google Gemini configuration. |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` / `GOOGLE_OAUTH_SCOPES` | server | OAuth client used for Gmail API with `gmail.send` scope. |
| `TOKEN_ENCRYPTION_KEY` | server | 32-byte base64 key for encrypting Gmail OAuth tokens (generate with `openssl rand -base64 32`). |
| `SENDGRID_API_KEY` | server | Optional fallback email provider key; leave unset to disable. |
| `FROM_EMAIL` | server | Default sender address for transactional email. |
| `APP_BASE_URL` | server | Public URL of the app (used in links inside emails). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | client | Firebase Web API key exposed to the browser. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client | Firebase Auth domain for client SDK. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client | Firebase project ID shared with the client. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | client | Firebase web app ID. |

Only `NEXT_PUBLIC_*` variables are shipped to the browser; everything else is resolved server-side via the typed env helpers in `src/config/env.ts`.

### Demo Mode (No Live Providers)

When you need to demo the full workflow without real OpenAI/Gemini keys, flip `DEMO_MODE=true`. Provider calls, PDF/email delivery, and storage writes fall back to deterministic fixtures so Firestore state transitions, UI progress, and finalized reports all behave exactly as production—just without touching external APIs.

- Populate every required variable with harmless placeholder values that satisfy the validators (URLs must be well-formed, emails must look like emails, and `TOKEN_ENCRYPTION_KEY` must be a 32-byte base64 string). Example:

  ```env
  # .env.local or Vercel preview/prod environment
  DEMO_MODE=true
  FIREBASE_PROJECT_ID=demo-project
  FIREBASE_CLIENT_EMAIL=demo-service-account@example.com
  FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n
  OPENAI_API_KEY=demo-openai-key
  OPENAI_DR_BASE_URL=https://demo.openai.local
  GEMINI_API_KEY=demo-gemini-key
  GEMINI_BASE_URL=https://demo.gemini.local
  GEMINI_MODEL=demo-model
  GOOGLE_OAUTH_CLIENT_ID=demo-google-client
  GOOGLE_OAUTH_CLIENT_SECRET=demo-google-secret
  GOOGLE_OAUTH_REDIRECT_URI=https://demo.app.local/oauth
  GOOGLE_OAUTH_SCOPES=email
  TOKEN_ENCRYPTION_KEY=ZNbb2KctfRPyl3MGqyG4PbnWVr7hKkxvxQ3T6HTLJmA=
  FROM_EMAIL=demo-user@example.com
  APP_BASE_URL=http://localhost:3000
  NEXT_PUBLIC_FIREBASE_API_KEY=demo-web-key
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-app.firebaseapp.com
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-project
  NEXT_PUBLIC_FIREBASE_APP_ID=demo-web-app
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-DEMO12345
  ```

- For Vercel, add the same entries under **Settings → Environment Variables** (enable them for Preview and Production). You can keep `DEMO_MODE=false` for the production project that uses real provider credentials while leaving it `true` for previews/local runs.
- Firebase Admin still needs a service account even in demo mode; you can upload a non-sensitive emulator key or a stripped-down service account that only hits local emulators.
- With the placeholders above in place, `pnpm dev` renders the research flow end-to-end, and `/api/research/[id]/run` no longer throws Firestore validation errors because provider state is reset without undefined fields.

### Firebase Emulator Usage

- Copy `.env.example` to `.env.local` and populate values; the same service account can be reused for emulator runs.
- Uncomment the `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` variables in `.env.local` when working with the Emulator Suite.
- Keep `APP_BASE_URL` pointed at `http://localhost:3000` so generated links and OAuth redirects resolve locally.
- The Gmail token crypto helper requires a stable `TOKEN_ENCRYPTION_KEY`; rotate this value in tandem with stored tokens if it changes.

## Implementation Roadmap

- **Auth:** Connect `/api/auth/session` and middleware to Firebase Auth & Google OAuth consent for Gmail scope. `DEV_AUTH_BYPASS` defaults to `false`; only toggle it on intentionally when you cannot obtain real tokens locally.
- **Firestore:** Replace stubbed responses with Firestore reads/writes, enforce ownership checks per requirement.
- **OpenAI Deep Research:** Implement session creation, refinement loop, execution, and polling utilities in `src/lib/providers/openaiDeepResearch.ts`.
- **Gemini:** Wire `generateContent` to invoke the appropriate Gemini model (with polling when required) and normalize the output.
- **PDF & Email:** Expand `buildResearchPdf` for full layout, then deliver via `sendResearchReportEmail` (Gmail first, SendGrid fallback).
- **State Machine:** Use `src/server/research/state-machine.ts` to validate transitions, surface errors consistently via `AppError`.
- **Testing:** Add emulator-backed integration tests and Playwright scenarios once the API contracts are fulfilled.
- **CI/CD:** GitHub Actions workflow (`.github/workflows/ci.yml`) runs linting, type checks, Vitest suites, and Playwright against every push/PR; update Vercel project settings when deploying.

## Deploying to Vercel

The application is optimized for Vercel’s hybrid Edge/Node platform. Follow the [Vercel staging deployment guide](docs/deployment/vercel-staging.md) for step-by-step instructions on wiring environment variables, OAuth redirect URIs, and preview branch deployments so reviewers can exercise the full dynamic experience without local setup.

## Testing Strategy

- **Unit:** Vitest + Testing Library for UI/state logic; sample test provided for research state machine.
- **Integration:** Vitest (node environment) + Supertest for API routes; tests are currently `skip`ped pending implementation.
- **E2E:** Playwright targets major browsers + mobile viewport; accessibility audits run via `@axe-core/playwright`.

## Continuous Integration

- Workflow: `.github/workflows/ci.yml`
- Checks: `pnpm lint`, `pnpm type-check`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`
- Badge: replace `OWNER/REPO` in the badge markup at the top of this README once the repository lives under its permanent GitHub namespace.

## Additional Notes

- Tailwind configuration lives in `tailwind.config.ts`, with global styles in `app/globals.css`.
- Environment validation fails fast via `src/config/env.ts` to prevent misconfiguration at runtime.
- Provider integrations and email logic are intentionally light – replace TODO sections as APIs become available.
- Repository assumes PNPM; adjust scripts if using npm or yarn.

### Production Authentication Checklist

Follow these steps before promoting a build that relies on real authentication:

1. **Disable the dev bypass**
   - Confirm `DEV_AUTH_BYPASS` (and related UID/email overrides) are unset in the production environment. These variables are meant for local `pnpm dev` only.
2. **Configure Firebase Auth**
   - In the Firebase Console, enable the Google sign-in provider and set the OAuth redirect domain (e.g., `your-app.vercel.app`).
   - Download a production service account key, store it as secrets (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`), and update `FIREBASE_PROJECT_ID`/`NEXT_PUBLIC_FIREBASE_*` to match.
3. **Install middleware session handling**
   - Ensure hosting (Vercel or custom Node runtime) forwards requests through `middleware.ts`. No extra work is needed on Vercel; other deployments must support Next.js middleware.
4. **Supply public client config**
   - Set `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, and `NEXT_PUBLIC_FIREBASE_APP_ID` for the production Firebase web app so the browser SDK can initialize.
5. **Lock down server-side verification**
   - Keep `getPublicEnv()` returning the production values; the middleware uses them to validate ID tokens via Firebase Identity Toolkit.
6. **Validate end-to-end**
   - Run `pnpm test:e2e` (or the CI workflow) with the production configuration. Manually sign in via Google on a staging URL to confirm redirects, headers, and session persistence before merging to `main`.

Happy building!
