# Architecture

The NestJS API owns all business operations and is exposed locally and through the Firebase Functions/Hosting boundary. The React administration client only accesses the API using shared Zod transport contracts. The framework-independent domain package owns time calculations, slot locks, and domain errors.

Firestore is the production persistence boundary: booking creation and rescheduling must use a transaction over 15-minute lock documents. The local implementation is deliberately an in-memory repository so core logic can be tested without cloud credentials; its public repository interface is the seam for the Firestore adapter. Google Calendar and Telegram are integration adapters and never replace Firestore as the booking authority.


## Contextual media

Media Store replaces the Services admin page, while the backend service catalog remains booking configuration. Shared media contracts validate metadata and file uploads. MediaStoreService owns Firestore media records, Storage object lifecycle, per-chat cooldown claims, and Telegram photo/video delivery. The assistant discovers media with get_media and selects at most one file per turn with send_media. Media instructions are appended to both default and custom prompts. get_services is a data lookup only. The internal situation description is never sent as a caption.

A Firestore lease serializes sends for the same chat/media ID; successful and uncertain delivery establish a cooldown, explicit rejection does not. Network uncertainty and process crashes prevent a strict exactly-once guarantee across Telegram and Firestore. No background retry sends client messages.

Telegram methods and URL transport constraints: https://core.telegram.org/bots/api#sending-files and https://core.telegram.org/bots/api#sendvideo. App uploads support JPEG/PNG (5 MB) and MP4 (20 MB); local JSON parser accepts 28 MiB for base64 transport. Uploaded URLs are intentionally shareable with clients.
