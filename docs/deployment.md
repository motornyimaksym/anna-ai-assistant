# Deployment

This repository deploys the React/Vite admin to **Firebase Hosting** and the NestJS API to a **2nd-gen Cloud Function** in `europe-west1`. Firebase App Hosting is a different product; its GitHub rollout tries to run the monorepo root with `pnpm start` and fails. The Hosting/Functions CLI release is independent of that backend; disconnect its automatic rollouts before the next GitHub push to avoid another failed App Hosting rollout.

The default Firestore Standard database for `anna-ai-assistant` is in `europe-west1`. `firebase/firebase.json` deploys deny-all client rules and the required indexes. The backend uses the Admin SDK and Firestore transactions for bookings, locks, and update claims. Production data is never seeded automatically.

Register a Firebase Web app and deploy the Google sign-in configuration in `firebase/firebase.json` with `npx -y firebase-tools@latest deploy --only auth --config firebase/firebase.json --project anna-ai-assistant`. The Google OAuth support email is displayed to people using sign-in. After the intended administrator signs in once, look up that account's Firebase Authentication UID and set it as the `ADMIN_UIDS` secret; redeploy the `api` function to load the new secret version. This UID is the owner account and can grant stakeholder access by verified email from Bot Settings. Stakeholders sign in with a Firebase-verified email matching the saved address. Put the Web app's public `apiKey`, `authDomain`, `projectId`, and `appId` into `apps/admin/.env.production.local` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. This local file is ignored by Git. Retrieve the registered app's current values with:

```bash
npx -y firebase-tools@latest apps:list WEB --project anna-ai-assistant
npx -y firebase-tools@latest apps:sdkconfig WEB <app-id> --project anna-ai-assistant
```

Rotate the Telegram bot token and OpenAI key exposed in the earlier App Hosting build log. Store fresh values with `npx -y firebase-tools@latest functions:secrets:set <NAME> --project anna-ai-assistant`. The function binds `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `ADMIN_UIDS` through Secret Manager. Obtain the admin UID from Firebase Authentication after the administrator signs in. Do not place these values in source files, `.env.production.local`, or build logs. If Google Calendar is configured, provide its nonsecret `GOOGLE_CLIENT_ID` and `GOOGLE_CALENDAR_ID` as shell environment variables when preparing the release; `DEFAULT_TIMEZONE` and `OPENAI_MODEL` are optional nonsecret runtime variables.
For the current private Telegram test, set nonsecret `TELEGRAM_ALLOWED_USERNAME=user61785` when preparing the release. The webhook ignores all other senders, including messages without a username; leaving the setting unset disables automated replies. Keep the username out of code so the restriction can be changed without editing the handler.

To deploy while Calendar authorization is pending, leave `GOOGLE_CLIENT_ID` and `GOOGLE_CALENDAR_ID` unset when running `firebase:prepare`. The API then uses Firestore booking data without Calendar busy intervals or event sync. An empty `ADMIN_UIDS` secret starts the API but denies all admin requests until an administrator UID is added.

From the repository root, prepare artifacts with `pnpm firebase:prepare`. Preparation copies `SPEC.md` into the private function package so the authenticated `/admin/spec` endpoint serves the same spec version as its backend release. Only after you explicitly authorize a production deployment, run the code-only release command:

```bash
pnpm firebase:deploy:code
```

`firebase:prepare` validates the public web config, builds all workspaces, generates an isolated Node.js 22 function package in ignored `firebase/functions`, and copies the admin build into ignored `firebase/public` for Hosting. Firebase CLI requires Hosting's public directory to be inside its project directory (`firebase/`). `pnpm firebase:deploy:code` prepares and deploys only Hosting and function `api` to `anna-ai-assistant`. The broader `pnpm firebase:deploy --project anna-ai-assistant` deploys all targets configured in `firebase/firebase.json`, including Functions, Hosting, Firestore rules/indexes, and Auth configuration. The generated function directory contains production dependencies and no local secret files. pnpm 11 approves dependency install scripts for `@firebase/util`, `esbuild`, and `protobufjs`; review newly reported build scripts before approving them.

After deployment, check `https://anna-ai-assistant.web.app/api/health` and sign in to the admin UI. Configure Telegram's webhook only after the API function URL, its secret, bot token, and sender restriction are ready. Use the direct function URL printed by Firebase CLI, followed by `/telegram/webhook` (for example, `https://<api-function-url>/telegram/webhook`). Do not route Telegram through Hosting's `/api/telegram/webhook` rewrite when using long read delays: Firebase Hosting rewrites have a 60-second request timeout, while the function is configured for up to 60 minutes. A long webhook request can delay delivery of subsequent updates. The 59-minute setting cap is not an end-to-end timeout guarantee: read delay plus OpenAI work and response pacing share the function's 60-minute invocation limit. When intentionally discarding queued test updates, call Telegram `setWebhook` with `drop_pending_updates=true` and the `secret_token` from Secret Manager; verify the URL and queue with `getWebhookInfo`.


The private assistant uses OpenAI Responses function calls. Set a Responses-capable `OPENAI_MODEL` and a funded API key. Both Business messages and private bot DMs are supported; include `message` in Telegram webhook `allowed_updates` for DMs. Keep `max_connections=1` during this test. Use `/confirm` to execute a proposed booking change or `/cancel` to discard it. Bookings persist in Firestore and appear at `/bookings`; Calendar can remain disabled. No demo services or hours are added automatically.


Telegram chat shows a `typing` action while OpenAI processes an accepted message. The worker refreshes it every four seconds for longer requests and stops when processing completes. It uses the existing Business connection ID where present; Telegram requires the connected bot to have reply rights.


Assistant replies are paced at 600 ms per Unicode code point before sending; typing remains visible while waiting. The maximum Telegram reply is 4,000 characters (up to 40 minutes pacing), so the HTTPS function timeout is one hour. This long wait increases function execution time and cost in proportion to reply length.


Production deployments require an explicit user request. Do not run `firebase:deploy`, `firebase:deploy:code`, or Firebase CLI deploy commands after coding, committing, or pushing unless the user explicitly asks to deploy. The code-only command is `pnpm firebase:deploy:code`; it builds, prepares, and deploys Hosting plus the `api` function only.

## Telegram account login

Bot Settings includes an owner-only Telegram account connection. Provision `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and `TELEGRAM_SESSION_ENCRYPTION_KEY` in Secret Manager before deploying the function. The last value is 32 cryptographically random bytes encoded as base64; preserve it across releases. Never expose these values in frontend env, build output, Git, or logs. Local development can supply the same names through the backend environment. No account is connected automatically by deployment: the owner enters their phone, Telegram login code, and optional personal Telegram account password (the password configured for two-step verification, distinct from the one-time login code) in Settings. A session can be checked and revoked there. Authorization does not import chats or change Business bot behavior.
