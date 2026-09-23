# Data model

Firestore collections are `services`, `availabilityRules`, `scheduleExceptions`, `clients`, `bookings`, `bookingSlots`, `conversations`, and `telegramUpdates`. The shapes and meaning are defined by `SPEC.md`; shared Zod schemas in `packages/contracts` are the API representation.

The application uses the default Firestore Standard database. The backend Admin SDK is its only data client; Firestore rules deny direct client reads and writes. `services`, `availabilityRules`, `scheduleExceptions`, and `conversations` use their domain IDs as document IDs. `bookings` use generated document IDs and store the booking DTO fields plus the internal `lockedSlots` array and the `bufferMinutes` snapshot taken at creation. `telegramUpdates/{updateId}` records a claimed update ID.

`bookingSlots` uses `resourceId_yyyy-MM-dd_HH-mm` document IDs. A booking occupies every 15-minute unit from its start through its post-appointment buffer. Writes are transactionally acquired and released with the booking status change. `telegramUpdates/{updateId}` is an idempotency marker.

Each `bookingSlots` document stores its `bookingId`. Creation reads every required slot document before writing the booking and slot documents in one transaction. Cancellation and rescheduling read the booking and relevant slot documents, then update the booking and release/acquire slots in a single transaction. A duplicate Telegram update is rejected by atomically creating its marker document.

No migration is needed for the initial schema. New persisted fields or collections require a prior specification and this document update.
