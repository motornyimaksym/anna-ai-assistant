# Local development

Copy `.env.example` to `.env` and supply only the integrations you intend to exercise. Start the API with `pnpm --filter api dev` and the admin UI with `pnpm --filter admin dev`. Use `pnpm firebase:emulators` for Firebase emulator services.

The backend starts on port 3000 and the Vite client on port 5173. Run `pnpm seed` against the configured persistence adapter to populate the documented development services and schedule.

