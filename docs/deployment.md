# Deployment

Build the workspaces before deploying. Configure backend secrets in Firebase/Google-managed configuration rather than source control, and configure Hosting to use the rewrite in `firebase/firebase.json`. Set the Telegram webhook only after the deployed `/api/telegram/webhook` endpoint and secret are configured.

`pnpm firebase:deploy` is intentionally manual and must only be run with explicit approval. Production must use a Firestore transaction-backed repository and Firebase ID token verification.

