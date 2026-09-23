# Deployment

Build the workspaces before deploying. Configure backend secrets in Firebase/Google-managed configuration rather than source control, and configure Hosting to use the rewrite in `firebase/firebase.json`. Set the Telegram webhook only after the deployed `/api/telegram/webhook` endpoint and secret are configured.

The pnpm 11 build approves dependency install scripts in `pnpm-workspace.yaml` for `@firebase/util`, `esbuild`, and `protobufjs`. Keep strict dependency-build checks enabled; review any newly reported dependency before adding it to `allowBuilds`. Cloud build logs must not contain secret values; configure credentials through managed secrets and rotate any credentials exposed in earlier logs.

`pnpm firebase:deploy` is intentionally manual and must only be run with explicit approval. Production must use a Firestore transaction-backed repository and Firebase ID token verification.
