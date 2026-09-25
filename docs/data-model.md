# Data model

Firestore collections are `services`, `availabilityRules`, `scheduleExceptions`, `clients`, `bookings`, `bookingSlots`, `conversations`, `telegramUpdates`, and `assistantSettings`. The shapes and meaning are defined by `SPEC.md`; shared Zod schemas in `packages/contracts` are the API representation.

The application uses the default Firestore Standard database. The backend Admin SDK is its only data client; Firestore rules deny direct client reads and writes. `services`, `availabilityRules`, `scheduleExceptions`, and `conversations` use their domain IDs as document IDs. `bookings` use generated document IDs and store the booking DTO fields plus the internal `lockedSlots` array and the `bufferMinutes` snapshot taken at creation. `telegramUpdates/{updateId}` records a claimed update ID.

`assistantSettings/prompt` stores a custom system prompt as `{ prompt, updatedAt }`. Its absence means the code default `ASSISTANT_SYSTEM_PROMPT` is active. Reset deletes the override document. Only the backend Admin SDK accesses this collection, via allowlisted admin API routes.

`assistantSettings/behavior` stores bot timing overrides as `{ maxReadDelayMs, typingDelayPerSymbolMs, updatedAt }`. `maxReadDelayMs` is an integer from 0 through 3,540,000 ms (59 minutes); the admin UI displays this value in seconds and converts it to milliseconds for the existing API/storage field. `typingDelayPerSymbolMs` is an integer from 0 through 800 ms. If the document is absent, backend defaults are 2,000 ms and 600 ms respectively. Only the backend Admin SDK accesses this document, via the allowlisted admin API.

`assistantSettings/adminAccess` stores stakeholder administrator email grants as `{ emails, updatedAt }`, where `emails` is a list of at most 100 unique normalized lowercase addresses. A verified Firebase ID token whose email is in this list grants admin access; UIDs listed in `ADMIN_UIDS` are owners and retain access independently of the list. Owners alone may modify the email list. The backend Admin SDK is the only data client.

`services/{serviceId}` stores catalog fields (`name`, `description`, duration, buffer, price, currency, and enabled state) plus optional Telegram presentation fields: `photoUrl` (Firebase Storage download URL), `telegramCaption: { text, entities }`, and `telegramButtons` (API rows of `{ text, url }`). New services default to a 30-minute buffer in the admin editor and seed data; changing this default does not modify existing services. Firestore stores URL buttons as a flat array of `{ row, text, url }` records because Firestore does not support nested arrays; the repository groups them back into rows at the API boundary. The description remains assistant reference data. Caption entities use Telegram message-entity types with UTF-16 offsets. Photos are uploaded through the Admin API and stored in Firebase Storage; only backend code can write objects. Tokenized download URLs are public by design for Telegram delivery and catalog display.

`bookingSlots` uses `resourceId_yyyy-MM-dd_HH-mm` document IDs. A booking occupies every 15-minute unit from its start through its post-appointment buffer. Writes are transactionally acquired and released with the booking status change. `telegramUpdates/{updateId}` is an idempotency marker.

Each `bookingSlots` document stores its `bookingId`. Creation reads every required slot document before writing the booking and slot documents in one transaction. Cancellation and rescheduling read the booking and relevant slot documents, then update the booking and release/acquire slots in a single transaction. A duplicate Telegram update is rejected by atomically creating its marker document.

No migration is needed for the initial schema. New persisted fields or collections require a prior specification and this document update.

## Service duration options

Services retain `durationMinutes` and `price` as their first option. Optional `durationOptions` stores up to nine additional `{ durationMinutes, price }` maps. All durations across the service must be unique (integer 15–480 minutes); prices are finite and nonnegative. Currency, buffer and Telegram content are shared. Missing options means the legacy single duration/price pair; no production migration is required.

New bookings snapshot server-selected `durationMinutes`, `price`, and `currency`. These fields are optional when reading historical bookings. Historical duration falls back to the start/end interval; historical price is unknown. Rescheduling preserves the snapshot and internal `bufferMinutes`, including when a catalog option is removed. Pending-action arguments may now contain a numeric `durationMinutes` alongside their existing string values. Availability and booking APIs use duration as the option selector, never trust a supplied price.


## Private assistant conversation state

`conversations/{chatId}/messages/{autoId}` stores `role` (`user` or `assistant`), `text`, and ISO `createdAt`. Read the newest 20 by descending creation time, then reverse for model context. No raw OpenAI payloads or credentials are persisted.

Conversation documents optionally contain `pendingAction`: `{name, arguments, expiresAt}`. Name is `create_booking`, `cancel_booking`, or `reschedule_booking`; arguments contain only service/time or booking/time fields. Expiry is an ISO timestamp. `/confirm` consumes this field before execution; identity is always supplied from the current Telegram message. Old documents without this field remain valid. Existing booking documents and slot transactions are unchanged.

## Telegram user account connection

`telegramAccount/primary` is backend-only (existing deny-all rules). Stores `phase` (`disconnected`, `code`, `password`, `connected`), `ownerUid` for pending flow, `expiresAt` (epoch ms), `attempts`, `retryAt` (Telegram flood cooldown, epoch ms), `startRetryAt` (code-request cooldown, epoch ms), masked phone, optional username, and `encrypted` AES-256-GCM envelope `{ version: 1, iv, tag, ciphertext }`. The encrypted JSON contains only `{ session, phone?, phoneCodeHash? }`. Code and 2FA password are never stored. Associated data binds ciphertext to `telegramAccount/primary:v1`. A random Secret Manager key protects pending and connected sessions. Do not rotate/delete the key while a session is connected: disconnect first.

`leaseId` and `leaseUntil` serialize network mutations using Firestore transactions. Completion checks the same unexpired lease before saving; stale workers cannot overwrite newer state. Leases expire after 50 seconds; individual Telegram operations time out after 20 seconds. Empty/disconnected records can retain cooldown metadata; completed logout removes session and identity fields. Pending authorization is usable only for ten minutes and by the initiating owner.
