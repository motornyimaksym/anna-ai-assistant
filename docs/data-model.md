# Data model

Firestore collections are `services`, `availabilityRules`, `scheduleExceptions`, `clients`, `bookings`, `bookingSlots`, `conversations`, and `telegramUpdates`. The shapes and meaning are defined by `SPEC.md`; shared Zod schemas in `packages/contracts` are the API representation.

`bookingSlots` uses `resourceId_yyyy-MM-dd_HH-mm` document IDs. A booking occupies every 15-minute unit from its start through its post-appointment buffer. Writes are transactionally acquired and released with the booking status change. `telegramUpdates/{updateId}` is an idempotency marker.

No migration is needed for the initial schema. New persisted fields or collections require a prior specification and this document update.

