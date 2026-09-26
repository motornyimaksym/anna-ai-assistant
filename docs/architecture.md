# Architecture

The NestJS API owns all business operations and is exposed locally and through the Firebase Functions/Hosting boundary. The React administration client only accesses the API using shared Zod transport contracts. The framework-independent domain package owns time calculations, slot locks, and domain errors.

Firestore is the production persistence boundary: booking creation and rescheduling must use a transaction over 15-minute lock documents. The local implementation is deliberately an in-memory repository so core logic can be tested without cloud credentials; its public repository interface is the seam for the Firestore adapter. Google Calendar and Telegram are integration adapters and never replace Firestore as the booking authority.


## Contextual media

Media Store replaces the Services admin page, while the backend service catalog remains booking configuration. Shared media contracts validate metadata and file uploads. MediaStoreService owns Firestore media records, Storage object lifecycle, per-chat cooldown claims, and Telegram photo/video delivery. The assistant discovers media with get_media and selects at most one file per turn with send_media. Media instructions are appended to both default and custom prompts. get_services is a data lookup only. The internal situation description is never sent as a caption.

A Firestore lease serializes sends for the same chat/media ID; successful and uncertain delivery establish a cooldown, explicit rejection does not. Network uncertainty and process crashes prevent a strict exactly-once guarantee across Telegram and Firestore. No background retry sends client messages.

Telegram methods and URL transport constraints: https://core.telegram.org/bots/api#sending-files and https://core.telegram.org/bots/api#sendvideo. App uploads support JPEG/PNG (5 MB) and MP4 (20 MB); local JSON parser accepts 28 MiB for base64 transport. Uploaded URLs are intentionally shareable with clients.

## Assistant knowledge base

The Assistant prompt and editable Knowledge Base are separate admin settings and Firestore documents. Without a Knowledge Base override, the API uses the versioned `DEFAULT_KNOWLEDGE_BASE` from `apps/api/src/default-knowledge-base.ts`; Reset deletes the override and returns that default. For every OpenAI request, the API composes the effective prompt with Media Store guidance, the editable knowledge text, and a fresh snapshot of enabled service records (names, descriptions, IDs, duration options, prices, and currencies). The live booking catalog remains authoritative for structured booking tools. The knowledge text is serialized as JSON factual context and must not override system rules or current service records.

OpenAI-generated client replies use Telegram HTML parse mode. The default prompt and a separately appended formatting instruction require supported `<b>`, `<i>`, and `<code>` tags only, escaped literal HTML characters, and no Markdown formatting markers. Deterministic local responses remain plain text.

The connected Telegram user account also supplies a read-only schedule snapshot. Incoming message updates trigger a refresh attempt; a Firestore transaction caps reads at one every five minutes across API instances. The first lookup uses tolerant title keywords, then stores the Telegram peer ID so later reads survive title changes. The latest five non-empty text messages appear verbatim on `/schedule`; this import does not affect booking availability or weekly schedule rules.

## Human-assistance routing

Before an eligible OpenAI turn, the API attempts to send the current client question, bounded conversation context, editable Knowledge Base, and fresh enabled service catalog to Jev's native Decisions endpoint when `JEV_TOKEN` is configured. A `noul` question estimates whether a reliable answer requires a human. The server validates the probability, compares it with the Bot Settings threshold, and retains all booking and authorization decisions. Missing token, Jev failure, malformed response, or oversized decision payload skips Jev and continues the regular OpenAI flow. Only a valid high score opens a human request. The `JEV_TOKEN` stays server-side.

Responder usernames are configured in Bot Settings. A responder must first enroll by sending `/start` to the bot; the server stores the verified numeric Telegram user/chat ID and rechecks the configured username on each action. This branch precedes the client test-sender filter but cannot enter client automation. A Firestore case and conversation pause are committed before Telegram notifications. Responders answer through `/answer <requestId> <text>`; the server relays to the original client chat and Business connection, then records the human message. Admins can view, answer, or release unresolved cases from Conversations. Firestore claims prevent concurrent answers; uncertain Telegram delivery remains paused for reconciliation. See `SPEC.md` section 44 and `docs/data-model.md` for the state contract.

## Private AI workspace

`/ai-chat` bypasses the booking-admin shell and uses the existing Firebase sign-in and AdminGuard (owner plus configured stakeholders). Per-UID Firestore threads, an isolated prompt/tool loop, and explicit action confirmations keep it separate from massage automation. A shared OpenAI Responses transport reuses model/key settings without sharing domain instructions or histories. `TelegramMcpService` acquires the existing account lease and forwards decrypted session material only over IAM-authenticated HTTPS to the private Python bridge in `services/telegram-mcp`. That bridge converts GramJS to Telethon in memory and calls a pinned chigwell/telegram-mcp process over MCP stdio. Browser access ends at the application API; neither generic MCP nor credentials are exposed. The bridge supports only four read operations and two writes; writes require a consumed application confirmation.

Schedule source configuration uses owner-only dialog discovery and verified ID selection through the existing Telegram account lease. Incoming webhooks and `/schedule` refresh use the persisted five-minute claim. The Settings refresh obeys that cooldown after success; after failure, it may retry immediately in a leased batch of up to five attempts with 10/20/30/40-second linear backoff for transient errors. Safe failure categories and attempt/success timestamps are returned with the read-only snapshot; attempt IDs reject stale completions after source changes.

Google Calendar authorization uses an owner-authenticated SPA callback, backend code exchange, single-use Firestore state bound to the initiating UID, PKCE and verified ID-token nonce. A dedicated connection store holds encrypted tokens and revision-guarded lifecycle state. CalendarService reads managed configuration dynamically with legacy fallback only before a managed record exists. Event calendar IDs are persisted per booking to retain correct routing after selection changes.
