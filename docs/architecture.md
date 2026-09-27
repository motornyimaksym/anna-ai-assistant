# Architecture

The NestJS API owns all business operations and is exposed locally and through the Firebase Functions/Hosting boundary. The React administration client only accesses the API using shared Zod transport contracts. The framework-independent domain package owns time calculations, slot locks, and domain errors.

Firestore is the production persistence boundary: booking creation and rescheduling must use a transaction over 15-minute lock documents. The local implementation is deliberately an in-memory repository so core logic can be tested without cloud credentials; its public repository interface is the seam for the Firestore adapter. Google Calendar and Telegram are integration adapters and never replace Firestore as the booking authority.


## Contextual media

Media Store replaces the Services admin page, while the backend service catalog remains booking configuration. Shared media contracts validate metadata and file uploads. MediaStoreService owns Firestore media records, Storage object lifecycle, per-chat cooldown claims, and Telegram photo/video delivery. The assistant discovers media with get_media and selects at most one file per turn with send_media. Media instructions are appended to both default and custom prompts. get_services is a data lookup only. The internal situation description is never sent as a caption.

A Firestore lease serializes sends for the same chat/media ID; successful and uncertain delivery establish a cooldown, explicit rejection does not. Network uncertainty and process crashes prevent a strict exactly-once guarantee across Telegram and Firestore. No background retry sends client messages.

Application-owned HTTP `fetch` calls use `@booking/http` with three linear retries (250/500/750 ms) for transient failures. Reads and explicitly idempotent operations can replay after transient status or network failure. OpenAI conversation/response requests carry a per-call idempotency key reused across attempts. Other writes retry only explicit HTTP 425/429 rejection or connection failure known to precede transmission; timeouts, resets and ambiguous 5xx results are not replayed. This preserves Telegram delivery uncertainty and durable booking recovery. Google auth library transports use the same linear delays for replay-safe methods only.

Telegram methods and URL transport constraints: https://core.telegram.org/bots/api#sending-files and https://core.telegram.org/bots/api#sendvideo. App uploads support JPEG/PNG (5 MB) and MP4 (20 MB); local JSON parser accepts 28 MiB for base64 transport. Uploaded URLs are intentionally shareable with clients.

## Assistant knowledge base

The Assistant prompt and editable Knowledge Base are separate admin settings and Firestore documents. Without a Knowledge Base override, the API uses the versioned `DEFAULT_KNOWLEDGE_BASE` from `apps/api/src/default-knowledge-base.ts`; Reset deletes the override and returns that default. For every System Two conversational request, the API composes the effective prompt with Media Store guidance, the editable knowledge text, and a fresh snapshot of enabled service records (names, descriptions, IDs, duration options, prices, and currencies). The live booking catalog remains authoritative for structured booking tools. The knowledge text is serialized as JSON factual context and must not override system rules or current service records.

OpenAI-generated client replies use Telegram HTML parse mode. The default prompt and a separately appended formatting instruction require supported `<b>`, `<i>`, and `<code>` tags only, escaped literal HTML characters, and no Markdown formatting markers. Deterministic local responses remain plain text.

The connected Telegram user account also supplies a read-only schedule snapshot. Incoming message updates trigger a refresh attempt; a Firestore transaction caps reads at one every five minutes across API instances. The first lookup uses tolerant title keywords, then stores the Telegram peer ID so later reads survive title changes. The latest five non-empty text messages appear verbatim on `/schedule` and enter the assistant prompt with timestamps. Calendar busy intervals from selected calendars enter the same prompt. The assistant interprets this context without a separate parser; Calendar and booking holds are checked again on confirmation. Admin weekly availability remains separate.

## Human-assistance routing

Jev routing is off by default through `JEV_ROUTING_ENABLED=false`; disabled turns go directly to OpenAI, even when a token exists. When `JEV_ROUTING_ENABLED=true` and `JEV_TOKEN` is configured, the API sends the current client question, bounded conversation context, editable Knowledge Base, and fresh enabled service catalog to Jev's native Decisions endpoint. A `noul` question estimates whether a reliable answer requires a human. The server validates the probability and compares it with the Bot Settings threshold. Missing token skips Jev; Jev failure with the flag and token enabled opens a `jev_unavailable` human case. The token stays server-side.

Responder usernames are configured in Bot Settings. A responder must first enroll by sending `/start` to the bot; the server stores the verified numeric Telegram user/chat ID and rechecks the configured username on each action. This branch precedes the client test-sender filter but cannot enter client automation. A Firestore case and conversation pause are committed before Telegram notifications. Escalation sends private bot DMs to connected responders, with no automatic client message. Responders answer through `/answer <requestId> <text>`; the server relays to the original client chat and Business connection, then records the human message. Admins can view, answer, or release unresolved cases from Conversations. Firestore claims prevent concurrent answers; uncertain Telegram delivery remains paused for reconciliation. See `SPEC.md` section 44 and `docs/data-model.md` for the state contract.

## Private AI workspace

`/ai-chat` bypasses the booking-admin shell and uses the existing Firebase sign-in and AdminGuard (owner plus configured stakeholders). Per-UID Firestore threads, an isolated prompt/tool loop, and explicit action confirmations keep it separate from massage automation. A shared OpenAI Responses transport reuses model/key settings without sharing domain instructions or histories. `TelegramMcpService` acquires the existing account lease and forwards decrypted session material only over IAM-authenticated HTTPS to the private Python bridge in `services/telegram-mcp`. That bridge converts GramJS to Telethon in memory and calls a pinned chigwell/telegram-mcp process over MCP stdio. Browser access ends at the application API; neither generic MCP nor credentials are exposed. The bridge supports only four read operations and two writes; writes require a consumed application confirmation.

Schedule source configuration uses owner-only dialog discovery and verified ID selection through the existing Telegram account lease. Incoming webhooks and `/schedule` refresh use the persisted five-minute claim. The Settings refresh obeys that cooldown after success; after failure, it may retry immediately in a leased batch of up to five attempts with 10/20/30/40-second linear backoff for transient errors. Safe failure categories and attempt/success timestamps are returned with the read-only snapshot; attempt IDs reject stale completions after source changes.

Google Calendar authorization uses an owner-authenticated SPA callback, backend code exchange, single-use Firestore state bound to the initiating UID, PKCE and verified ID-token nonce. A dedicated connection store holds encrypted tokens and revision-guarded lifecycle state. CalendarService reads managed configuration dynamically with legacy fallback only before a managed record exists. Event calendar IDs are persisted per booking to retain correct routing after selection changes.


## Booking from chat context

Raw Telegram schedule messages and selected Google Calendar busy intervals enter the assistant prompt. The model uses chat text to suggest times; BookingService checks Calendar conflicts and booking holds for all entry points. Firestore operation/slot transactions precede Calendar writes; verified success finalizes booking. Errors retain holds and route the Telegram conversation to configured human responders. Recovery is an explicit admin action, with deterministic event IDs and operation leases preventing duplicate writes. External Calendar edits cannot participate in Firestore transactions.

No separate schedule extraction request, derived windows, or schedule revision is stored.

## Separate booking planner

System One selects the Booking workflow, whose conversation model delegates scheduling to `plan_booking`. `BookingPlannerService` makes a separate schema-constrained OpenAI request using the editable booking prompt, raw Telegram schedule messages and live Calendar intervals. It validates the result against catalog, ownership and timing, returns clarification/unavailable without pausing the conversation, or stages the existing pending action. Confirmed proposals execute through the natural-confirmation flow below and repeat Calendar conflict checks. Every function call in a persistent OpenAI Conversation is closed with a matching `function_call_output`, including when the application prepares a local reply; local-reply paths make a final tool-free Responses call before returning.

Private debug events trace routing, planning and reply delivery without recording raw conversations or secrets. A bounded backend event buffer is visible at `/debug` only to the exact configured debug owner; the default is the sole existing owner UID. API authorization is independent of navigation visibility.

## System One / System Two

The active selector calls TypeSafe's `/v1/systemone` with `jev-latest` first. Registry routing and boolean yes/no decisions use Choice; probability estimation uses Noul. The adapter validates typed answers and distributions, maps yes/no explicitly, and respects caller cancellation plus a 30-second deadline. Transient requests use the shared bounded retry policy. On any TypeSafe decision failure, the same decision runs once through `OpenAiSystemOneSelector` with its own 10-second deadline. If both fail, existing human recovery applies. An expired assistant turn never starts fallback. System Two and the booking planner still use OpenAI; the legacy optional Jev precheck is separate.

Assistant exception logs include bounded, redacted underlying error details for diagnosis. Jev routing logs include trace ID, route reason, probability and threshold, so an intentional human handoff can be distinguished from a failed request. Firestore diagnostics retain safe categories only; they do not persist exception text, credentials, provider bodies or conversation content.

Eligible bot text → existing guards and optional Jev gate → System One → selected System Two workflow → reply.

`SystemOneSelector` is the provider-neutral port. Its routing result is a validated `SystemTwoPromptId` (`general` or `booking`). `AppModule` binds a TypeSafe-first selector with an OpenAI fallback. Selection receives bounded conversational context and an active-proposal flag, not business facts or booking authority. Every client message goes through language understanding; the assistant exposes no client command syntax. TypeSafe gets 30 seconds and OpenAI fallback gets 10 seconds within the 60-second model exchange deadline. The System One prompt tester allows 45 seconds overall. If both decisions fail, existing safe human recovery applies; no silent default route.

The System Two registry owns route descriptions, prompt definitions and tool policies. General answers informational questions with its existing editable prompt. Booking starts with dedicated conversation instructions, resolves intent/owned booking IDs using its tools, then uses the existing editable structured planner. Thus Booking can use multiple calls, while General no longer acts as router. Shared default safety policies apply to both; General overrides apply only to General. The Booking editor continues to control structured planning, not routing or tool permissions. Client proposal approval/refusal uses the boolean decision flow below. Client chat has no command syntax.

The concise default General prompt contains shared conversation and safety guidance. System Two appends first-person voice, Telegram formatting, media, route-specific tool policy, confirmation rules, and live business context once; those sections are not repeated in the General default. Existing custom overrides retain their stored text.

The `/prompt` admin page groups instructions under System One and System Two tabs. Nested tabs show Routing, Approval, and Probability for System One; General, Booking conversation, and Booking planner for System Two. All six prompts have independent editors with save/reset and default/custom status. The protected backend prompt catalog supplies tab descriptions and code defaults. Tab switches preserve unsaved drafts.

Routing editor exposes instructions plus General and Booking Choice criteria separately. TypeSafe receives each value in its native field; legacy single-prompt routing overrides supply instructions with default criteria.

The debug page separates system events from a designated-owner prompt tester. The tester runs one isolated model call using the selected current prompt; it displays tool requests without executing tools. System One consent/probability tests use a fixed example proposal. The structured booking planner test uses synthetic schedule context and cannot confirm real availability. Test inputs and outputs are neither persisted nor appended to diagnostic events.

To replace System One, implement `select(input, signal)`, `answerBoolean(input, signal)` and `estimateProbability(input, signal)` and replace the Nest provider binding. No OpenAI types appear in that contract. To add a future confirmation or other workflow, extend the typed registry, tool policy and handler dispatch, describe routing criteria, and add routing/isolation tests. UI provider selection and an editable classifier are deferred. `/ai-chat` stays independent.

Design decisions: mixed scheduling/information requests route to Booking; ambiguous short replies use bounded history; failed selection opens existing human recovery. No unresolved implementation questions. Future product choices include selector model/provider settings and further uses of probability estimates; neither changes server authorization.

## System One decisions and natural confirmation

The OpenAI adapter accepts reasoning metadata alongside exactly one decision message for all three operations. It discards reasoning items and validates the message's single output-text JSON using the operation-specific schema. Incomplete responses, missing/duplicate messages, refusals, tool calls and unknown output types fail closed. Reasoning metadata is never a decision or diagnostic payload.

System One now exposes three provider-neutral operations: `select`, `answerBoolean`, and `estimateProbability`. Each has separate instructions and strict output validation. Generic decision inputs contain a server-authored question and bounded factual context. Boolean results are actual booleans; probability estimates are finite numbers in [0,1] and currently unused by production workflows. Do not interpret an estimate as a calibrated measurement.

Pending proposal + new client message → one boolean explicit-approval check. True atomically consumes the exact proposal and executes through existing booking checks. False atomically discards the proposal, including uncertainty, questions, or changed details; invalid or failed decisions enter safe recovery. System Two never interprets consent to execute its own proposal. Proposal summaries request a natural-language decision; client chat has no command shortcuts.

New proposals carry an ID and immutable client-facing summary. The transactional compare-and-consume rechecks identity, expiry, automation and human pause state; concurrent or stale approvals cannot consume another proposal. Ordinary Telegram activity updates use a field-only touch to avoid restoring stale pending actions. Model failures retain proposals and follow human recovery. A legacy proposal without a stored summary cannot be naturally confirmed; request a fresh proposal. Provider replacements implement all three operations using the same cancellation signal contract.
All six `/prompt` tabs have independent editable overrides. The active TypeSafe System One selector reads Routing, Approval and Probability overrides per request; System Two Booking conversation reads its own override. Existing General and Booking planner storage remains in place. Mandatory output schemas, tool policies, booking checks and factual context are server-authored after editable prompt text. Reset removes only the selected override; the next request uses its code default.

OpenAI transport failures include a sanitized `providerError` object (`code`, `param`, `message`) in server exception logs. Error bodies are bounded to 16 KiB and discarded after extracting these fields; invalid/unreadable bodies retain HTTP status and request ID. Request content, credentials, quoted values and identifiers are redacted before exception attachment. Firestore and client errors retain their existing safe categories.

### Admin presentation

The booking admin shell owns a scoped MUI cyberpunk theme, grouped responsive navigation, page headings and a dashboard launchpad. Shared component overrides keep existing editors, tables and dialogs visually consistent. Mobile navigation uses a modal drawer; desktop navigation remains visible. The standalone AI workspace retains its own presentation. Dashboard shortcuts do not imply live integration health or fabricate operational metrics.

Admin appearance supports day/night palettes through a scoped theme provider. Header and login controls update the same provider without remounting editors. A browser-local preference restores the selection; inaccessible storage degrades to an in-memory choice. The AI workspace remains outside this provider.
