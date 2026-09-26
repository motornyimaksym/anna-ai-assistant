# Telegram Booking Assistant

Production-oriented TypeScript monorepo for a Telegram Business massage-booking assistant. Product behavior is defined in [SPEC.md](SPEC.md); contributor ordering rules are in [AGENTS.md](AGENTS.md).

## Quick start

```bash
pnpm install
pnpm dev
```

Useful commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm seed`, and `pnpm firebase:emulators`. Deployment is deliberately not part of normal setup.

## Deployment

From the repository root, deploy Firebase Hosting and the API to `anna-ai-assistant`:

```bash
pnpm firebase:deploy:code
```

This command validates locally supplied encryption keys, builds the workspaces, prepares release artifacts, and deploys Hosting and the `api` function.

Root `.env` is not uploaded. Production secrets come from Secret Manager; export the required nonsecret runtime settings before running the command. The script does not automatically preserve deployed settings. See [deployment setup and configuration](docs/deployment.md) before deploying.

Production deployment requires an explicit user request, as defined in [AGENTS.md](AGENTS.md).
