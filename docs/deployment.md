# Deployment

This repository deploys the React/Vite admin to **Firebase Hosting** and the NestJS API to a **2nd-gen Cloud Function** in `europe-west1`. Firebase App Hosting is a different product; its GitHub rollout tries to run the monorepo root with `pnpm start` and fails. Disconnect the App Hosting backend's automatic rollouts before releasing this repository through Firebase Hosting.

The default Firestore Standard database for `anna-ai-assistant` is in `europe-west1`. `firebase/firebase.json` deploys deny-all client rules and the required indexes. The backend uses the Admin SDK and Firestore transactions for bookings, locks, and update claims. Production data is never seeded automatically.

Register a Firebase Web app and enable Authentication with Google sign-in. Put its public `apiKey`, `authDomain`, `projectId`, and `appId` into `apps/admin/.env.production.local` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. This local file is ignored by Git. Retrieve the registered app's current values with:

```bash
npx -y firebase-tools@latest apps:list WEB --project anna-ai-assistant
npx -y firebase-tools@latest apps:sdkconfig WEB <app-id> --project anna-ai-assistant
```

Rotate the Telegram bot token and OpenAI key exposed in the earlier App Hosting build log. Store fresh values with `npx -y firebase-tools@latest functions:secrets:set <NAME> --project anna-ai-assistant`. The function binds `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `ADMIN_UIDS` through Secret Manager. Obtain the admin UID from Firebase Authentication after the administrator signs in. Do not place these values in source files, `.env.production.local`, or build logs. If Google Calendar is configured, provide its nonsecret `GOOGLE_CLIENT_ID` and `GOOGLE_CALENDAR_ID` as shell environment variables when preparing the release; `DEFAULT_TIMEZONE` and `OPENAI_MODEL` are optional nonsecret runtime variables.

Prepare and deploy from the repository root:

```bash
pnpm firebase:prepare
npx -y firebase-tools@latest deploy --config firebase/firebase.json --project anna-ai-assistant
```

`firebase:prepare` validates the public web config, builds all workspaces, and generates an isolated Node.js 22 function package in ignored `firebase/functions`. The deployment script `pnpm firebase:deploy --project anna-ai-assistant` runs both commands. The generated directory contains production dependencies and no local secret files. pnpm 11 approves dependency install scripts for `@firebase/util`, `esbuild`, and `protobufjs`; review newly reported build scripts before approving them.

After deployment, check `https://anna-ai-assistant.web.app/api/health` and sign in to the admin UI. Configure Telegram's webhook only after `/api/telegram/webhook`, its secret, and the bot token are ready. The webhook URL is `https://anna-ai-assistant.web.app/api/telegram/webhook`.
