# Architecture

The NestJS API owns all business operations and is exposed locally and through the Firebase Functions/Hosting boundary. The React administration client only accesses the API using shared Zod transport contracts. The framework-independent domain package owns time calculations, slot locks, and domain errors.

Firestore is the production persistence boundary: booking creation and rescheduling must use a transaction over 15-minute lock documents. The local implementation is deliberately an in-memory repository so core logic can be tested without cloud credentials; its public repository interface is the seam for the Firestore adapter. Google Calendar and Telegram are integration adapters and never replace Firestore as the booking authority.

