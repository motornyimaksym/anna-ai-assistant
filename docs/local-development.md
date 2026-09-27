# Local development

Set backend-only `TYPESAFE_AI_TOKEN` in the repository-root ignored `.env` for System One. The default adapter uses TypeSafe AI Choice for routing/boolean decisions and Noul for probability estimates, with model `jev-latest`. Keep `OPENAI_API_KEY` for System Two and booking planning. Missing TypeSafe credentials fail the decision request; there is no automatic OpenAI fallback. Local secrets are never uploaded by a build.

Create a root `.env` when needed and supply only the integrations you intend to exercise; the variable names are listed in `SPEC.md`. This file is ignored by Git. Start the API with `pnpm --filter api dev` and the admin UI with `pnpm --filter admin dev`. Use `pnpm firebase:emulators` for Firebase emulator services.

The local API loads the root `.env` on startup without overriding environment variables already set by the shell. Jev routing defaults off. Set `JEV_ROUTING_ENABLED=true` and put `JEV_TOKEN` in `.env` to exercise the Jev gate locally. The production function uses Secret Manager for the token.

The backend starts on port 2301 and the Vite client on port 5173. Run `pnpm seed` against the configured persistence adapter to populate the documented development services and schedule.


### Schedule and Calendar booking

The separate booking planner receives five recent Telegram schedule messages with timestamps and Calendar busy intervals. Its structured JSON is validated by the backend; ambiguous or missing context returns clarification/unavailability to the client. Edit its independent prompt on `/prompt`. Booking confirmation independently checks Calendar conflicts and booking holds. In Google Settings choose a writable booking calendar and conflict calendars, then Check connection to inspect scopes. Unknown/missing write permission requires checking/reconnecting. Configure responsible people and have them enroll with `/start`. Failed booking operations keep locks until an admin reviews and retries from Bookings. No deployment is implied by local changes.

Exact starts are also supported: `Ср: 17:30, 19:30`. Weekdays mean the next occurrence from the message timestamp (including same day). No intermediate starts are invented. `11;00` is accepted as `11:00`.

Diagnostics appear at `/debug` for the sole configured owner (or explicit `DEBUG_OWNER_UID` chosen from `ADMIN_UIDS`). Other admins cannot fetch the log API. Logs contain safe routing and planning metadata, not raw prompts or client messages.
