# Local development

Create a root `.env` when needed and supply only the integrations you intend to exercise; the variable names are listed in `SPEC.md`. This file is ignored by Git. Start the API with `pnpm --filter api dev` and the admin UI with `pnpm --filter admin dev`. Use `pnpm firebase:emulators` for Firebase emulator services.

The backend starts on port 2301 and the Vite client on port 5173. Run `pnpm seed` against the configured persistence adapter to populate the documented development services and schedule.
