# Vercel Staging Deployment Guide

This project is designed to run best on Vercel. Follow the steps below to host a dynamic staging environment that exercises the edge UI and Node-based provider functions without requiring reviewers to run the stack locally.

## 1. Create the Vercel project

1. Sign in to [Vercel](https://vercel.com/) with an account that can access the GitHub repository.
2. Click **Add New → Project** and import the repository.
3. When prompted for framework detection, keep the defaults for **Next.js**. Vercel will automatically run `pnpm install` and `pnpm vercel-build`.
4. Pick a staging branch (for example, `staging` or `main`) to auto-deploy preview builds. Every push to that branch will spin up a new dynamic staging URL.

## 2. Configure environment variables

The app depends on secrets for Firebase, OpenAI Deep Research, Gemini, PDF generation, and email. Define the variables in **Project Settings → Environment Variables** for at least the **Preview** environment so every staging deployment inherits them.

| Name | Recommended Scope | Notes |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Preview & Production | Must match the Firebase project connected to Auth & Firestore. |
| `FIREBASE_CLIENT_EMAIL` | Preview & Production | Service account email. |
| `FIREBASE_PRIVATE_KEY` | Preview & Production | Paste the multi-line key as-is; Vercel preserves newlines. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Preview & Production | Client SDK configuration. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Preview & Production |  |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Preview & Production |  |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Preview & Production |  |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Preview & Production | Optional; needed for Analytics. |
| `OPENAI_API_KEY` | Preview & Production | Required for the OpenAI Deep Research provider. |
| `OPENAI_DR_BASE_URL` | Preview & Production | Leave as `https://api.openai.com/v1` unless using a proxy. |
| `GEMINI_API_KEY` | Preview & Production |  |
| `GEMINI_BASE_URL` | Preview & Production | Defaults to `https://generativelanguage.googleapis.com/v1`. |
| `GEMINI_MODEL` | Preview & Production | Example: `gemini-2.0-pro`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Preview & Production | Gmail OAuth client with the `gmail.send` scope. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Preview & Production |  |
| `GOOGLE_OAUTH_REDIRECT_URI` | Preview & Production | Should point at `https://<project>.vercel.app/api/auth/session` or a custom domain equivalent. |
| `GOOGLE_OAUTH_SCOPES` | Preview & Production | Keep default (`https://www.googleapis.com/auth/gmail.send`). |
| `TOKEN_ENCRYPTION_KEY` | Preview & Production | 32-byte base64 key (generate with `openssl rand -base64 32`). |
| `SENDGRID_API_KEY` | Preview & Production | Optional fallback email provider. Leave unset to disable. |
| `FROM_EMAIL` | Preview & Production | Sender email address shown in PDF emails. |
| `APP_BASE_URL` | Preview & Production | Set to the staging domain (e.g., `https://<project>.vercel.app`). |
| `NODE_VERSION` | Preview & Production | Set to `20` to match local development/runtime expectations. |

Tips:

- Use the **Environment Variables → Import from .env** shortcut to upload an `.env.local` file that already contains correct values.
- Store long secrets (such as the Firebase private key) using the **Encryption** toggle so Vercel hides them from logs and UI.
- If you need to share variables across projects, create an [Environment Variable Group](https://vercel.com/docs/projects/environment-variables#groups) and attach it here.

## 3. Enable the dynamic (Node) runtime for heavy API routes

Next.js automatically runs API route handlers in the Node runtime when they use Node-specific packages (like `firebase-admin` or `pdf-lib`). No extra configuration is required, but you can enforce the runtime per route by exporting `export const runtime = "nodejs";` in files that handle provider calls, PDF generation, or email. This ensures Vercel never tries to execute them in the Edge runtime.

## 4. Set up Firebase and OAuth redirect URIs

1. In the Firebase console, add the Vercel staging domain (and any custom staging domains) to the **Authorized domains** list under **Authentication → Settings**.
2. For the Gmail OAuth client, update the **Authorized redirect URI** to match the staging domain. Example: `https://<project>.vercel.app/api/auth/session`.
3. If you plan to use the Firebase Emulator locally alongside the staging environment, keep the emulator environment variables commented out on Vercel so hosted builds use production services.

## 5. Trigger the first deployment

1. Push the branch you selected for staging.
2. Vercel will install dependencies, run the Next.js build (`pnpm vercel-build`), and deploy the project.
3. Confirm the deployment finished successfully and open the generated preview URL.
4. Sign in with Google, walk through the research flow, and verify that the PDF/email steps run through the Node functions.

## 6. Optional: Promote staging builds to production

- Once the staging environment is healthy, connect the **Production** environment to the `main` branch (or whichever branch you use for releases).
- Reuse the same environment variable set or clone the Preview configuration so production inherits the secrets.
- Consider enabling [Vercel Protection](https://vercel.com/docs/security/protection) if the staging app should be limited to reviewers.

## 7. Local parity with Vercel

- Run `vercel env pull .env.vercel` to download the latest environment variables for local testing.
- When debugging serverless functions, use `pnpm dev` locally. Vercel’s preview deployments will execute the same code with the staging secrets, so parity remains high.

Following these steps yields a hosted staging environment that mirrors production behavior, letting reviewers experience the full research workflow without setting up Firebase, OpenAI, or Gmail locally.
